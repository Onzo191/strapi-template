import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DEFAULT_MAX_SKEW_SECONDS,
  isFreshTimestamp,
  type RevalidatePayload,
  SIGNATURE_HEADER,
  signingPayload,
  TIMESTAMP_HEADER,
  tagsForEntry,
} from "@vng/shared";
import { revalidatePath, revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * On-demand revalidation webhook receiver (§5.3).
 *
 * Flow: Strapi lifecycle → signed POST here → verify HMAC → map the changed
 * entry to §5.2 cache tags → `revalidateTag()` (+ `revalidatePath()` for the
 * detail routes). The cache is Next's own per-instance ISR cache, and this app
 * runs as a single instance (ADR-008), so invalidating it here invalidates the
 * cache that actually serves traffic.
 *
 * This route does NOT rebuild or redeploy — it only marks cache tags stale, so
 * the next request regenerates from the CMS. Content freshness with zero build.
 *
 * P7 hardening, in the order a request meets it:
 *  1. **Rate limit** before any work — an unauthenticated flood is rejected
 *     without touching the body or the cache.
 *  2. **Body size cap** before reading — an attacker must not be able to make us
 *     buffer an arbitrarily large string just to fail its signature.
 *  3. **Replay window** — the timestamp is inside the signed payload, so a
 *     captured-and-replayed POST expires in minutes instead of working forever.
 *     Each replay would otherwise force a cluster-wide purge plus a full
 *     regeneration storm against Strapi: amplified DoS via an authentic message.
 *  4. **HMAC** over `<timestamp>.<rawBody>`, constant-time compared.
 *
 * Runs on the Node runtime (needs `node:crypto`) and is never cached itself.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A revalidation payload is a handful of short strings. 16 KiB is ~100× the
 * largest legitimate body (an article with many tags) and still trivially cheap
 * to buffer.
 */
const MAX_BODY_BYTES = 16 * 1024;

/** Generous enough for a bulk publish of a locale, tight enough to bound a flood. */
const RATE_LIMIT = Number(process.env.REVALIDATE_RATE_LIMIT ?? 120);
const RATE_WINDOW_MS = 60_000;

/**
 * Constant-time compare of the `sha256=<hex>` signature against a fresh HMAC of
 * `<timestamp>.<rawBody>`. Rejects unsigned / mismatched / malformed signatures
 * — a length mismatch is caught before `timingSafeEqual` (which throws on
 * unequal buffer lengths).
 */
function verifySignature(
  timestamp: string,
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = `sha256=${createHmac("sha256", secret)
    .update(signingPayload(timestamp, rawBody))
    .digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Extra route paths to bust alongside tags (§5.3 "revalidateTag()/revalidatePath()").
 * Tags already invalidate the pages that fetched the data, but revalidating the
 * canonical detail path is a cheap belt-and-suspenders for the highest-traffic
 * routes.
 *
 * `slug` and `locale` are interpolated into a path, so they are validated first:
 * a slug of `../../` would otherwise let a caller with a valid signature
 * revalidate arbitrary routes, and one containing a newline would corrupt the
 * log line below.
 */
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const SAFE_LOCALE = /^[a-z]{2}(?:-[A-Z]{2})?$/;

function pathsForEntry(p: RevalidatePayload): string[] {
  if (!p.slug || !p.locale) return [];
  if (!SAFE_SLUG.test(p.slug) || !SAFE_LOCALE.test(p.locale)) return [];
  switch (p.model) {
    case "article":
      return [`/${p.locale}/tin-tuc/${p.slug}`];
    case "landing-page":
      return [`/${p.locale}/${p.slug}`];
    default:
      return [];
  }
}

/** Strip CR/LF so an attacker-controlled field can't forge extra log lines. */
function logSafe(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "-";
  return String(value)
    .replace(/[\r\n]+/g, " ")
    .slice(0, 200);
}

export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    // Misconfiguration, not a client error — fail loud so it's noticed.
    console.error("[revalidate] REVALIDATE_SECRET is not set — refusing all requests");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  // (1) Rate limit first: cheapest possible rejection for a flood.
  const limit = rateLimit(`revalidate:${clientKey(req.headers)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  // (2) Reject an oversized body on the declared length before buffering it.
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  // Read the raw body BEFORE parsing — the HMAC is over the exact bytes sent.
  const rawBody = await req.text();
  // A chunked request carries no content-length, so re-check what we actually got.
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const signature = req.headers.get(SIGNATURE_HEADER);
  const timestamp = req.headers.get(TIMESTAMP_HEADER);

  // (3) Replay window. Checked before the HMAC so a replay costs us no hashing.
  if (!isFreshTimestamp(timestamp, DEFAULT_MAX_SKEW_SECONDS)) {
    console.warn("[revalidate] rejected request with missing/stale timestamp");
    return NextResponse.json({ error: "stale or missing timestamp" }, { status: 401 });
  }

  // (4) Authenticity. `timestamp` is non-null here (isFreshTimestamp rejects null).
  if (!verifySignature(timestamp as string, rawBody, signature, secret)) {
    console.warn("[revalidate] rejected request with invalid/missing signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: RevalidatePayload;
  try {
    payload = JSON.parse(rawBody) as RevalidatePayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!payload?.model || typeof payload.model !== "string") {
    return NextResponse.json({ error: "missing model" }, { status: 400 });
  }

  const tags = tagsForEntry(payload);
  const paths = pathsForEntry(payload);

  // Idempotent: revalidating the same tag twice is a no-op; the cache handler
  // just re-stamps the tag's invalidation timestamp.
  //
  // Next 16 requires the second arg. `{ expire: 0 }` means *immediate*
  // invalidation (Next core treats `expire === 0` as the immediate path, and
  // our cache handler stamps `expired = now`), so the very next request on any
  // instance regenerates — this is what delivers < ~2s freshness rather than a
  // deferred stale-while-revalidate. Passing an object also avoids the
  // single-arg deprecation warning.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  for (const path of paths) revalidatePath(path);

  console.info(
    `[revalidate] model=${logSafe(payload.model)} documentId=${logSafe(payload.documentId)} ` +
      `locale=${logSafe(payload.locale)} slug=${logSafe(payload.slug)} ` +
      `tags=[${tags.join(",")}] paths=[${paths.join(",")}]`,
  );

  return NextResponse.json({
    revalidated: true,
    model: payload.model,
    tags,
    paths,
    now: Date.now(),
  });
}
