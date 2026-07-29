/**
 * Virus-scan verdict receiver (Req §2, §0 A6 — Mode B in `src/upload/virus-scan.ts`).
 *
 * The S3 `ObjectCreated` Lambda (`infra/lambda/virus-scan/`) scans the object with
 * ClamAV and POSTs the verdict here, signed with `UPLOAD_SCAN_CALLBACK_SECRET`.
 *
 * On `infected` we do three things, in this order:
 *   1. delete the file through the upload plugin's own service — which removes
 *      *both* the `plugin::upload.file` row and the S3 object, so the malware
 *      stops being reachable through CloudFront immediately;
 *   2. write an immutable audit entry (§4.5), so the deletion is visible to
 *      compliance rather than only in CloudWatch;
 *   3. log at `error`, which is what the alarm keys on.
 *
 * On `clean` we only stamp `provider_metadata.virusScan`, so the library can
 * distinguish "scanned and clean" from "never scanned".
 *
 * Unauthenticated route, so it is hardened like the revalidation webhook: body
 * cap → replay window → constant-time HMAC. Note the ordering — nothing that
 * touches the database happens before the signature verifies.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Core } from "@strapi/strapi";
import {
  DEFAULT_MAX_SKEW_SECONDS,
  isFreshTimestamp,
  SIGNATURE_HEADER,
  signingPayload,
  TIMESTAMP_HEADER,
} from "@vng/shared";

/** A verdict payload is a few short strings. */
const MAX_BODY_BYTES = 8 * 1024;

interface ScanCallbackBody {
  /** S3 object key, e.g. `uploads/my_image_abc123.png`. */
  key?: string;
  /** Strapi file `hash` (filename without extension) — the reliable join key. */
  fileHash?: string;
  status?: "clean" | "infected" | "error";
  signature?: string;
}

type Ctx = {
  request: {
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
  };
  badRequest: (msg: string) => unknown;
  unauthorized: (msg: string) => unknown;
  body: unknown;
};

/**
 * The HMAC covers a **canonical string built from the parsed fields**, not the
 * raw request bytes.
 *
 * The revalidation webhook signs raw bytes because both ends are ours and the
 * receiver is a Next Route Handler that can read the body before parsing. Here
 * the body has already been consumed by Strapi's `koa-body` middleware by the
 * time a controller runs, so reconstructing the exact original bytes would mean
 * depending on `includeUnparsed` and a `Symbol.for('unparsedBody')` lookup —
 * i.e. on koa-body internals, for a signature check. Signing a fixed field order
 * instead is immune to JSON key ordering, whitespace and Unicode escaping, and
 * the field set is closed (anything not listed here is not signed and therefore
 * not trusted).
 */
function canonicalPayload(body: ScanCallbackBody): string {
  return [body.status ?? "", body.key ?? "", body.fileHash ?? "", body.signature ?? ""].join("\n");
}

function header(ctx: Ctx, name: string): string | null {
  const raw = ctx.request.headers[name];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

function verify(timestamp: string, rawBody: string, provided: string | null, secret: string) {
  if (!provided) return false;
  const expected = `sha256=${createHmac("sha256", secret)
    .update(signingPayload(timestamp, rawBody))
    .digest("hex")}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Strip CR/LF so an attacker-controlled field cannot forge extra log lines. */
const logSafe = (value: unknown): string =>
  String(value ?? "-")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 200);

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async callback(ctx: Ctx) {
    const secret = process.env.UPLOAD_SCAN_CALLBACK_SECRET;
    if (!secret) {
      // Feature not enabled — look absent rather than broken.
      return ctx.badRequest("Upload scanning is not configured.");
    }

    const payload = (ctx.request.body ?? {}) as ScanCallbackBody;

    // Shape-check before signing so a malformed body can't make the canonical
    // string ambiguous (e.g. an array `key` joining into something unexpected).
    for (const field of ["key", "fileHash", "status", "signature"] as const) {
      const value = payload[field];
      if (value !== undefined && typeof value !== "string") {
        return ctx.badRequest(`\`${field}\` must be a string.`);
      }
    }
    const canonical = canonicalPayload(payload);
    if (Buffer.byteLength(canonical) > MAX_BODY_BYTES) {
      return ctx.badRequest("Verdict payload too large.");
    }

    const timestamp = header(ctx, TIMESTAMP_HEADER);
    if (!isFreshTimestamp(timestamp, DEFAULT_MAX_SKEW_SECONDS)) {
      return ctx.unauthorized("Stale or missing timestamp.");
    }
    if (!verify(timestamp as string, canonical, header(ctx, SIGNATURE_HEADER), secret)) {
      strapi.log.warn("[virus-scan] rejected callback with an invalid signature");
      return ctx.unauthorized("Invalid signature.");
    }

    if (!payload.status || !["clean", "infected", "error"].includes(payload.status)) {
      return ctx.badRequest("`status` must be one of clean | infected | error.");
    }
    if (!payload.key && !payload.fileHash) {
      return ctx.badRequest("One of `key` or `fileHash` is required.");
    }

    // Resolve the file. `hash` is the stable join key (Strapi's own filename
    // stem); the S3 key is derived from it plus the configured root path, so a
    // `rootPath` change would break key-based lookup but not hash-based.
    const hash = payload.fileHash ?? deriveHash(payload.key as string);
    const file = await strapi.db.query("plugin::upload.file").findOne({ where: { hash } });

    if (!file) {
      // Not an error: the file may already have been deleted by an editor, or the
      // event may be for an object we don't manage. 200 so the Lambda doesn't retry.
      strapi.log.info(`[virus-scan] callback for unknown file hash=${logSafe(hash)} — ignoring`);
      ctx.body = { handled: false, reason: "file not found" };
      return;
    }

    if (payload.status === "infected") {
      strapi.log.error(
        `[virus-scan] INFECTED file in bucket: id=${file.id} name=${logSafe(file.name)} ` +
          `signature=${logSafe(payload.signature)} — deleting`,
      );

      // The upload plugin's `remove` deletes the DB row *and* asks the provider to
      // delete the object, which is what actually stops CloudFront serving it.
      try {
        await strapi.plugin("upload").service("upload").remove(file);
      } catch (err) {
        strapi.log.error(`[virus-scan] failed to delete infected file: ${(err as Error).message}`);
        // Still audit below — an infected file we *failed* to delete is the most
        // important thing in this whole flow to have a record of.
      }

      await recordAudit(strapi, {
        action: "hardDelete",
        entryTitle: file.name,
        reason: `Virus scan verdict: infected (${payload.signature ?? "unknown signature"})`,
      });

      ctx.body = { handled: true, deleted: true };
      return;
    }

    await stampScanState(strapi, file, payload);
    ctx.body = { handled: true, deleted: false };
  },
});

/** `uploads/my_image_abc123.png` → `my_image_abc123`. */
function deriveHash(key: string): string {
  const base = key.split("/").pop() ?? key;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

async function stampScanState(
  strapi: Core.Strapi,
  file: { id: number; provider_metadata?: Record<string, unknown> | null },
  payload: ScanCallbackBody,
): Promise<void> {
  try {
    await strapi.db.query("plugin::upload.file").update({
      where: { id: file.id },
      data: {
        provider_metadata: {
          ...(file.provider_metadata ?? {}),
          virusScan: {
            status: payload.status,
            scannedAt: new Date().toISOString(),
            mode: "async",
            ...(payload.status === "error" ? { message: payload.signature ?? null } : {}),
          },
        },
      },
    });
  } catch (err) {
    strapi.log.warn(`[virus-scan] could not stamp scan state: ${(err as Error).message}`);
  }
}

/** Best-effort audit write — never fail the callback because auditing failed. */
async function recordAudit(
  strapi: Core.Strapi,
  entry: { action: string; entryTitle: string; reason: string },
): Promise<void> {
  try {
    await strapi.plugin("editorial").service("audit").record({
      action: entry.action,
      contentType: "plugin::upload.file",
      entryTitle: entry.entryTitle,
      actorEmail: "system:virus-scan",
      actorName: "Virus scanner",
      reason: entry.reason,
    });
  } catch (err) {
    strapi.log.error(`[virus-scan] could not write audit entry: ${(err as Error).message}`);
  }
}
