/**
 * Signed-webhook envelope shared by the CMS sender (`apps/cms/src/webhooks/
 * revalidation.ts`) and the web receiver (`apps/web/app/api/revalidate/route.ts`).
 *
 * P3 shipped HMAC authenticity. P7 adds **replay resistance**: the timestamp is
 * signed alongside the body and the receiver rejects anything outside a short
 * window. Without it, a captured revalidation POST could be replayed
 * indefinitely — each replay forces a cluster-wide cache purge and a full
 * regeneration storm against Strapi, which is a cheap amplified DoS against the
 * exact path §5.3 depends on for freshness.
 *
 * Node's `node:crypto` is imported lazily by the callers rather than here so
 * this module stays importable from the CMS's CJS `dist` bundle *and* the web
 * app's ESM build without pulling a runtime dependency into either.
 */

/** Header carrying `sha256=<hex>` over `<timestamp>.<rawBody>`. */
export const SIGNATURE_HEADER = "x-vng-signature";

/** Header carrying the Unix-epoch-seconds timestamp that was signed. */
export const TIMESTAMP_HEADER = "x-vng-timestamp";

/** How far apart sender and receiver clocks may drift, in seconds. */
export const DEFAULT_MAX_SKEW_SECONDS = 300;

/**
 * The exact string the HMAC is computed over. Binding the timestamp into the
 * signed payload is what makes it tamper-proof — a bare `X-Timestamp` header the
 * signature didn't cover could just be rewritten by the replayer.
 */
export function signingPayload(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

/**
 * Is `timestamp` (Unix seconds, as a string) within `maxSkewSeconds` of now?
 * Rejects non-numeric input and timestamps too far in the future as well as the
 * past — a far-future timestamp would otherwise mint a signature valid forever.
 */
export function isFreshTimestamp(
  timestamp: string | null | undefined,
  maxSkewSeconds: number = DEFAULT_MAX_SKEW_SECONDS,
  now: number = Date.now(),
): boolean {
  if (!timestamp) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  return Math.abs(now / 1000 - seconds) <= maxSkewSeconds;
}
