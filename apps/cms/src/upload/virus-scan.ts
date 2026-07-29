/**
 * Upload virus scanning (Req §2, §0 A6 — "media stored on S3; virus scanning via
 * an upload-lifecycle hook → Lambda (ClamAV)").
 *
 * Two complementary modes, because the two threats are different:
 *
 * ### Mode A — inline scan (set `CLAMAV_HOST`)
 *
 * The configured upload provider's `upload`/`uploadStream` is wrapped, so the
 * bytes are scanned **before the object is ever written to S3**. An infected file
 * is rejected with a 400 the editor can read, and nothing lands in the bucket or
 * the media library. This is the mode that actually *prevents* hosting malware
 * under `vng.com.vn`, which is the reputational risk that matters: a corporate
 * domain serving a trojan is a takedown and a customer-trust event, not just an
 * internal incident.
 *
 * Runs as a `clamd` sidecar in the CMS ECS task (see the deployment ADR).
 *
 * ### Mode B — asynchronous scan (set `UPLOAD_SCAN_CALLBACK_SECRET`)
 *
 * The S3 `ObjectCreated` event triggers a Lambda running ClamAV
 * (`infra/lambda/virus-scan/`), which posts a signed verdict back to
 * `POST /api/upload-scan/callback`. An infected file is deleted from the media
 * library *and* the bucket, and the deletion is recorded in the immutable audit
 * log (§4.5) so it is visible to compliance rather than only in CloudWatch.
 *
 * Mode B exists because Mode A cannot see files that reach the bucket by any
 * other route — a direct `aws s3 cp` by an operator, a restored backup, a future
 * pre-signed direct-to-S3 upload. Defence in depth over one perfect gate.
 *
 * ### Fail-closed
 *
 * If a scanner is configured but unreachable, uploads are **rejected**
 * (`UPLOAD_SCAN_FAIL_OPEN=true` overrides). An unavailable scanner means unknown
 * files; for media on a public corporate site, "editor sees an error and retries"
 * is a much cheaper failure than "we serve an unscanned binary". This is the
 * opposite call from the rate limiter, deliberately — there, failing closed would
 * lock every editor out of the CMS, whereas here it blocks one action.
 */
import type { Core } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import { clamAvConfigFromEnv, ping, type ScanVerdict, scanBuffer } from "./clamav";

/** Shape the upload provider hands to `upload` / `uploadStream`. */
interface ProviderFile {
  name?: string;
  hash?: string;
  ext?: string;
  mime?: string;
  size?: number;
  buffer?: Buffer;
  stream?: NodeJS.ReadableStream;
  provider_metadata?: Record<string, unknown> | null;
}

type ProviderMethod = (file: ProviderFile, options?: unknown) => Promise<unknown>;

interface UploadProvider {
  upload?: ProviderMethod;
  uploadStream?: ProviderMethod;
  delete?: (file: ProviderFile, options?: unknown) => Promise<unknown>;
}

const failOpen = () => process.env.UPLOAD_SCAN_FAIL_OPEN === "true";

/** Read a stream into a Buffer, bounded so a huge upload can't exhaust memory. */
async function readStream(stream: NodeJS.ReadableStream, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buf.length;
    if (total > maxBytes) {
      throw new errors.PayloadTooLargeError(
        `Upload exceeds the ${maxBytes}-byte scan limit and cannot be virus-scanned.`,
      );
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/**
 * Wrap the provider so nothing is stored unscanned (Mode A).
 *
 * `uploadStream` is handled by buffering the stream, scanning, then handing a
 * fresh buffer to the underlying `upload`. That trades the streaming
 * memory profile for the ability to scan at all — clamd's INSTREAM needs the
 * whole object, and the alternative (scan after storing) is the very race this
 * mode exists to close. `UPLOAD_MAX_FILE_SIZE_BYTES` (also the `formidable`
 * ceiling in `config/middlewares.ts`) bounds the cost.
 */
function decorateProvider(strapi: Core.Strapi): void {
  const config = clamAvConfigFromEnv();
  if (!config) return;

  const plugin = strapi.plugin("upload") as unknown as { provider?: UploadProvider };
  const provider = plugin?.provider;
  if (!provider) {
    strapi.log.error(
      "[virus-scan] upload provider is not initialised — inline scanning is NOT active",
    );
    return;
  }

  const maxBytes = Number(process.env.UPLOAD_MAX_FILE_SIZE_BYTES ?? 50 * 1024 * 1024);

  const scan = async (file: ProviderFile): Promise<void> => {
    let buffer: Buffer;
    if (file.buffer) {
      buffer = file.buffer;
    } else if (file.stream) {
      buffer = await readStream(file.stream, maxBytes);
      // The stream is consumed; hand the underlying provider the bytes instead.
      file.buffer = buffer;
      file.stream = undefined;
    } else {
      // Nothing to scan (provider-specific path) — treat as a scanner failure so
      // the fail-closed policy applies rather than silently passing.
      if (failOpen()) return;
      throw new errors.ApplicationError("Upload could not be read for virus scanning.");
    }

    const verdict: ScanVerdict = await scanBuffer(buffer, config);

    if (verdict.status === "clean") return;

    if (verdict.status === "infected") {
      strapi.log.error(
        `[virus-scan] REJECTED infected upload "${String(file.name).replace(/[\r\n]+/g, " ")}" ` +
          `signature=${verdict.signature}`,
      );
      // Deliberately generic message: echoing the signature name back would let
      // someone probe our signature database by uploading crafted samples.
      throw new errors.ApplicationError(
        "This file was rejected by the virus scanner and has not been stored.",
      );
    }

    strapi.log.error(`[virus-scan] scanner error: ${verdict.message}`);
    if (failOpen()) {
      strapi.log.warn("[virus-scan] UPLOAD_SCAN_FAIL_OPEN=true — storing the file UNSCANNED");
      return;
    }
    throw new errors.ApplicationError(
      "The virus scanner is unavailable, so the upload was not stored. Please retry.",
    );
  };

  const wrap = (method: ProviderMethod): ProviderMethod => {
    return async (file, options) => {
      await scan(file);
      return method.call(provider, file, options);
    };
  };

  // Capture the ORIGINALS before assigning. Reading `provider.upload` after wrapping it
  // would compose wrap(wrap(upload)) for the stream path, scanning every streamed
  // upload twice — doubling the clamd round-trip an editor waits on, for nothing.
  const originalUpload = provider.upload?.bind(provider);
  const originalUploadStream = provider.uploadStream?.bind(provider);

  if (originalUpload) provider.upload = wrap(originalUpload);
  if (originalUploadStream) {
    // After scanning, the bytes live in `file.buffer` (the stream is consumed), so route
    // through the original `upload` when the provider has one.
    provider.uploadStream = wrap(originalUpload ?? originalUploadStream);
  }

  strapi.log.info(`[virus-scan] inline clamd scanning active (${config.host}:${config.port})`);

  // Probe once at boot so a misconfigured host surfaces in the deploy log rather
  // than on the first editor's upload.
  void ping(config).then((ok) => {
    if (!ok) {
      strapi.log.error(
        `[virus-scan] clamd at ${config.host}:${config.port} did not answer PING — ` +
          `uploads will be ${failOpen() ? "stored UNSCANNED" : "rejected"} until it does`,
      );
    }
  });
}

/**
 * Stamp every newly created file with its scan state (Mode B bookkeeping), so
 * `provider_metadata.virusScan` answers "has this been scanned?" for any file in
 * the library. Uses `provider_metadata` (an existing JSON column on
 * `plugin::upload.file`) rather than extending the core content type, which would
 * mean a migration on a table Strapi owns.
 */
function subscribeLifecycle(strapi: Core.Strapi): void {
  const asyncEnabled = Boolean(process.env.UPLOAD_SCAN_CALLBACK_SECRET);
  const inlineEnabled = Boolean(clamAvConfigFromEnv());
  if (!asyncEnabled && !inlineEnabled) return;

  strapi.db.lifecycles.subscribe({
    models: ["plugin::upload.file"],
    async afterCreate(event) {
      const result = event.result as { id?: number; provider_metadata?: Record<string, unknown> };
      if (!result?.id) return;
      try {
        await strapi.db.query("plugin::upload.file").update({
          where: { id: result.id },
          data: {
            provider_metadata: {
              ...(result.provider_metadata ?? {}),
              virusScan: {
                // Inline mode already scanned it — the file only exists because
                // the provider call succeeded.
                status: inlineEnabled ? "clean" : "pending",
                scannedAt: inlineEnabled ? new Date().toISOString() : null,
                mode: inlineEnabled ? "inline" : "async",
              },
            },
          },
        });
      } catch (err) {
        // Bookkeeping must never fail an otherwise-successful upload.
        strapi.log.warn(`[virus-scan] could not stamp scan state: ${(err as Error).message}`);
      }
    },
  });
}

/**
 * Called from `bootstrap()` — not `register()`. The upload plugin sets
 * `strapi.plugin('upload').provider` in its own `register()`, and the relative
 * order of plugin and application register hooks is not something to depend on;
 * by `bootstrap()` the provider and the DB layer are both guaranteed ready.
 */
export function setupUploadVirusScan(strapi: Core.Strapi): void {
  decorateProvider(strapi);
  subscribeLifecycle(strapi);

  if (!clamAvConfigFromEnv() && !process.env.UPLOAD_SCAN_CALLBACK_SECRET) {
    strapi.log.warn(
      "[virus-scan] no scanner configured (CLAMAV_HOST / UPLOAD_SCAN_CALLBACK_SECRET unset) — " +
        "uploads are NOT scanned. Required before production (Req §2).",
    );
  }
}
