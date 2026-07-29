import "server-only";

/**
 * Per-instance fixed-window rate limiter for the web app's Route Handlers
 * (P7 §9 "rate limit").
 *
 * Scope, stated plainly: this counts **per instance**, in process memory. With
 * two Fargate tasks behind an ALB (§A2) the effective ceiling is `limit ×
 * instances`. That is deliberate and sufficient for what it protects:
 *
 * - `/api/revalidate` is already authenticated by HMAC + a 5-minute replay
 *   window, so this is a second-order brake on a *valid-signature* flood (a
 *   compromised CMS, or a runaway publish loop), not the primary control.
 * - `/api/preview` is guarded by a shared secret; the limiter's job is to make
 *   brute-forcing that secret impractical, and a factor-of-two slack on the
 *   attempt budget does not change that.
 *
 * The CMS's own limiter (`apps/cms/src/middlewares/rate-limit.ts`) is
 * Redis-backed and cluster-wide because it fronts admin login, where the
 * per-instance slack *would* matter. Sharing that Redis from here was considered
 * and rejected: the ISR cache handler's Redis client is a separate connection
 * pool on the hot render path, and coupling request admission to its
 * availability would turn a Redis blip into a site outage — the cache handler
 * explicitly degrades to no-cache instead.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Drop expired buckets so a rotating key space can't grow memory unbounded. */
function sweep(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Requests still allowed in the current window. */
  remaining: number;
  /** Seconds until the window resets — used for `Retry-After`. */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }

  bucket.count += 1;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfter };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfter };
}

/**
 * IPv4 / IPv6 shape check. The key is used to build a bucket identifier, so an
 * unbounded attacker-controlled string would let one client mint unlimited distinct
 * buckets (and so evade its own limit, while growing the map). Anything that isn't
 * plausibly an address is discarded rather than keyed on.
 */
const IP_LIKE = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * Best-effort client identity for rate-limit keying.
 *
 * `x-forwarded-for` is only trustworthy when the request definitely passed through our
 * own ALB/CloudFront, which append to it. We take the **last** hop rather than the
 * first: a client can prepend arbitrary values to XFF, but it cannot remove what our
 * own proxy appended. `TRUSTED_PROXY_HOPS` lets ops tune how many trailing hops are
 * ours (ALB alone = 1; CloudFront + ALB = 2).
 *
 * The trust assumption is explicit: with no proxy in front, XFF is entirely
 * client-controlled and this degrades to a per-claimed-identity limit. That is
 * acceptable for the two endpoints it guards — both are already authenticated by a
 * shared secret, so the limiter is a second-order brake, not the access control.
 *
 * `UNKEYED` is a single shared bucket, used only when no usable address is found. It
 * is generous by construction (see the callers' limits) because collapsing every
 * client into one bucket must not become an accidental global outage — which is
 * exactly what a `NaN` `TRUSTED_PROXY_HOPS` used to cause here.
 */
const UNKEYED = "unkeyed";

export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return UNKEYED;

  const hops = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (hops.length === 0) return UNKEYED;

  // A non-numeric env var must not silently collapse every client into one bucket.
  const configured = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10);
  const trusted = Number.isFinite(configured) && configured > 0 ? configured : 1;

  const index = Math.max(0, hops.length - trusted);
  const hop = hops[index];
  return hop && IP_LIKE.test(hop) ? hop : UNKEYED;
}
