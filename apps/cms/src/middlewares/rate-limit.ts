/**
 * Request rate limiting for the CMS (P7 §9 "rate limit").
 *
 * Four tiers, because the things being protected fail differently:
 *
 * | Tier      | Matches                                   | Why this budget |
 * |-----------|-------------------------------------------|-----------------|
 * | `auth`    | `/admin/login`, `/admin/register*`, `/admin/forgot-password`, `/admin/reset-password`, `/api/auth/*` | Credential stuffing. Tight (10/5min) — a real editor logs in once. |
 * | `sso`     | `/api/sso/*`                              | OIDC redirects, not credential guessing. Looser (60/5min) so a NAT'd office isn't locked out. |
 * | `write`   | POST/PUT/PATCH/DELETE elsewhere           | Bulk-write / upload abuse, and the cost of the virus scan per upload. |
 * | `read`    | everything else                           | Content-API scraping and the amplification it puts on Postgres. |
 *
 * ## In-process, and why that is now the right scope
 *
 * Counters live in this process's memory — a fixed-window `Map`, no external
 * store. That is sound because the deployment runs **one CMS instance**
 * (ADR-008): with a single process, per-instance *is* cluster-wide, so the
 * simple design and the strong guarantee coincide.
 *
 * This replaced a Redis-backed limiter. The trade that made Redis look necessary
 * was: with ≥2 instances a per-instance counter gives an attacker
 * `limit × instances` login attempts, and lets them round-robin so no single
 * instance ever sees enough failures to trip. That reasoning still holds — so if
 * the CMS is ever scaled past one instance, this file is the thing to revisit,
 * and the budgets below must be divided by the instance count to keep the same
 * effective ceiling. `RATE_LIMIT_INSTANCES` exists for exactly that.
 *
 * ## Fails *closed* now, where the old one failed open
 *
 * The Redis version had to fail open — a Redis blip must not lock every editor
 * out mid-launch. With no external dependency there is nothing to be unavailable,
 * so the limiter is simply always in force. That is a strict improvement: the old
 * code silently did **nothing at all** whenever `REDIS_URL` was unset, which is
 * how most non-production deployments actually ran.
 *
 * Memory is bounded by `sweep()`, and keys are address-shaped only (see
 * `clientKey`), so a rotating key space cannot grow the map without limit.
 */
import type { Core } from "@strapi/strapi";

interface Tier {
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Endpoints where a *credential* is submitted. These get the tight budget.
 *
 * `/admin/access-token` is deliberately absent: every admin tab calls it on each
 * access-token refresh (every 15 min, per tab), so putting it on a 10-per-5-min
 * budget would lock working editors out of the panel. It is a POST, so it lands
 * in the `write` tier, which is the right shape for it.
 */
const AUTH_PATHS = [
  "/admin/login",
  "/admin/register",
  "/admin/register-admin",
  "/admin/forgot-password",
  "/admin/reset-password",
  "/api/auth/",
];

/**
 * The OIDC endpoints get their own, more generous budget. They are worth limiting
 * — `/callback` accepts an attacker-supplied `code` — but they are *not*
 * credential-guessing surfaces (a wrong `state` or `code` just fails), and with
 * `OIDC_ENFORCE=true` every session-less admin page load redirects through
 * `/sso/login`. A whole office behind one NAT'd egress IP would trip the tight
 * budget within minutes and be unable to log in at all.
 */
const SSO_PATHS = ["/api/sso/"];

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** IPv4 / IPv6 shape check — see `clientKey`. */
const IP_LIKE = /^[0-9a-fA-F:.]{3,45}$/;

interface Bucket {
  count: number;
  /** Epoch ms at which this window ends and the counter resets. */
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Drop expired buckets so a rotating key space can't grow memory unbounded.
 *
 * Only walks the map once it is large enough to matter — an O(n) sweep on every
 * request would itself be the cheapest denial of service available against this
 * middleware.
 */
function sweep(now: number): void {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Fixed-window counter. Returns the request's position in the current window, so
 * `count > limit` is the rejection test and `limit - count` the remaining budget.
 */
function hit(key: string, windowSeconds: number): { count: number; resetAt: number } {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowSeconds * 1000 };
    buckets.set(key, fresh);
    return fresh;
  }

  existing.count += 1;
  return existing;
}

/**
 * Client identity for keying. Prefers the last `X-Forwarded-For` hop appended by
 * our own load balancer over the first (which the client controls and can
 * forge); `TRUSTED_PROXY_HOPS` says how many trailing hops are ours.
 * Falls back to Koa's `ctx.request.ip`, which respects `server.proxy`.
 */
function clientKey(ctx: {
  request: { ip: string; header: Record<string, string | string[] | undefined> };
}): string {
  const raw = ctx.request.header["x-forwarded-for"];
  const forwarded = Array.isArray(raw) ? raw.join(",") : raw;
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      // A non-numeric env var must not produce a NaN index (which would silently
      // collapse every client onto the fallback key).
      const configured = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10);
      const trusted = Number.isFinite(configured) && configured > 0 ? configured : 1;
      const hop = hops[Math.max(0, hops.length - trusted)];
      // The hop becomes part of a bucket key. An arbitrary attacker-controlled string
      // would let one client mint unlimited distinct keys — evading its own limit while
      // growing the map. Only address-shaped values are keyed.
      if (hop && IP_LIKE.test(hop)) return hop;
    }
  }
  return ctx.request.ip;
}

/**
 * Structural subset of the Koa context this middleware touches.
 * `ctx.tooManyRequests` is one of the 4xx/5xx helpers Strapi generates onto the
 * context from `node:http`'s status table (see `@strapi/core` `koa-methods`).
 */
interface RateLimitCtx {
  request: {
    ip: string;
    path: string;
    method: string;
    header: Record<string, string | string[] | undefined>;
  };
  set: (field: string, value: string) => void;
  tooManyRequests: (message?: string) => void;
}

function tierFor(path: string, method: string, tiers: Record<string, Tier>): Tier {
  if (AUTH_PATHS.some((prefix) => path.startsWith(prefix))) return tiers.auth;
  if (SSO_PATHS.some((prefix) => path.startsWith(prefix))) return tiers.sso;
  if (WRITE_METHODS.has(method)) return tiers.write;
  return tiers.read;
}

/**
 * Read a positive integer from the environment, falling back to `fallback` for
 * anything missing or malformed. A `NaN` limit would compare false against every
 * count and disable the tier silently.
 */
function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  /**
   * Divisor for every budget. Left at 1 for the single-instance deployment this
   * is built for; set it to the instance count if the CMS is ever scaled out, so
   * the *effective* cluster-wide ceiling stays what these numbers say. It cannot
   * make counting cluster-wide — see the module doc — only stop the ceiling from
   * multiplying silently.
   */
  const instances = positiveInt(process.env.RATE_LIMIT_INSTANCES, 1);
  const share = (limit: number) => Math.max(1, Math.floor(limit / instances));

  const tiers: Record<string, Tier> = {
    auth: {
      name: "auth",
      limit: share(positiveInt(process.env.RATE_LIMIT_AUTH, 10)),
      windowSeconds: positiveInt(process.env.RATE_LIMIT_AUTH_WINDOW, 300),
    },
    sso: {
      name: "sso",
      limit: share(positiveInt(process.env.RATE_LIMIT_SSO, 60)),
      windowSeconds: positiveInt(process.env.RATE_LIMIT_SSO_WINDOW, 300),
    },
    write: {
      name: "write",
      limit: share(positiveInt(process.env.RATE_LIMIT_WRITE, 120)),
      windowSeconds: positiveInt(process.env.RATE_LIMIT_WRITE_WINDOW, 60),
    },
    read: {
      name: "read",
      limit: share(positiveInt(process.env.RATE_LIMIT_READ, 600)),
      windowSeconds: positiveInt(process.env.RATE_LIMIT_READ_WINDOW, 60),
    },
  };

  const enabled = process.env.RATE_LIMIT_ENABLED !== "false";
  if (!enabled) {
    // Loud, because this is a security control being turned off. The only
    // legitimate use is a load test against a throwaway environment.
    strapi.log.warn("[rate-limit] disabled via RATE_LIMIT_ENABLED=false");
  } else if (instances > 1) {
    strapi.log.warn(
      `[rate-limit] RATE_LIMIT_INSTANCES=${instances}: counters are per-instance, ` +
        "so budgets are divided rather than shared. See ADR-008 before scaling out.",
    );
  }

  return async (ctx: RateLimitCtx, next: () => Promise<void>) => {
    if (!enabled) return next();

    const tier = tierFor(ctx.request.path, ctx.request.method, tiers);
    const key = `${tier.name}:${clientKey(ctx)}`;
    const { count, resetAt } = hit(key, tier.windowSeconds);

    ctx.set("X-RateLimit-Limit", String(tier.limit));
    ctx.set("X-RateLimit-Remaining", String(Math.max(0, tier.limit - count)));

    if (count > tier.limit) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      strapi.log.warn(
        `[rate-limit] ${tier.name} tier exceeded: ${ctx.request.method} ${ctx.request.path} ` +
          `from ${clientKey(ctx)} (${count}/${tier.limit} per ${tier.windowSeconds}s)`,
      );
      ctx.set("Retry-After", String(retryAfter));
      return ctx.tooManyRequests("Rate limit exceeded. Please retry later.");
    }

    return next();
  };
};
