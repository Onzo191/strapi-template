/**
 * Request rate limiting for the CMS (P7 §9 "rate limit").
 *
 * Three tiers, because the things being protected fail differently:
 *
 * | Tier      | Matches                                   | Why this budget |
 * |-----------|-------------------------------------------|-----------------|
 * | `auth`    | `/admin/login`, `/admin/register*`, `/admin/forgot-password`, `/admin/reset-password`, `/api/auth/*` | Credential stuffing. Tight (10/5min) — a real editor logs in once. |
 * | `sso`     | `/api/sso/*`                              | OIDC redirects, not credential guessing. Looser (60/5min) so a NAT'd office isn't locked out. |
 * | `write`   | POST/PUT/PATCH/DELETE elsewhere           | Bulk-write / upload abuse, and the cost of the virus scan per upload. |
 * | `read`    | everything else                           | Content-API scraping and the amplification it puts on RDS. |
 *
 * ## Cluster-wide, unlike the web app's limiter
 *
 * This one is **Redis-backed** (the same ElastiCache instance the ISR cache
 * handler uses, under a separate key prefix). With ≥2 Strapi tasks (§A2), a
 * per-instance counter would give an attacker `limit × instances` login attempts
 * and — worse — round-robin them so no single instance ever sees enough failures
 * to trip. For credential stuffing that difference is the whole control.
 *
 * If Redis is unreachable the limiter **fails open** and logs. That is a
 * deliberate availability-over-strictness call for a content site: a Redis blip
 * must not lock every editor out of the CMS mid-launch. It is safe because it is
 * not the only login control — bcrypt password hashing, the tightened admin
 * session lifetimes (`config/admin.ts`) and IdP-side MFA (`plugins/sso`) all
 * remain in force. The fail-open is logged at `error` so it is alertable.
 */
import type { Core } from "@strapi/strapi";
import { createClient, type RedisClientType } from "redis";

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

const KEY_PREFIX = process.env.REDIS_RATELIMIT_PREFIX ?? "vng:cms:ratelimit:v1";

let client: RedisClientType | null = null;
let connecting: Promise<unknown> | null = null;
/** Logged once, not per request, so a Redis outage doesn't flood the log. */
let degradedLogged = false;

function ensureClient(strapi: Core.Strapi): void {
  if (client) return;
  const url = process.env.REDIS_URL;
  if (!url) return;

  client = createClient({
    url,
    socket: {
      connectTimeout: 1000,
      reconnectStrategy: (retries) => Math.min(2000, 100 + retries * 100),
    },
  }) as RedisClientType;

  // Mandatory: without an 'error' listener node-redis throws on every failed
  // reconnect. `isReady` gates real usage.
  client.on("error", (err: Error) => {
    if (!degradedLogged) {
      strapi.log.error(`[rate-limit] redis error — failing open: ${err.message}`);
      degradedLogged = true;
    }
  });

  connecting = client.connect().catch((err: Error) => {
    strapi.log.error(`[rate-limit] initial redis connect failed — failing open: ${err.message}`);
  });
}

/** A ready client, or null. Never throws, never blocks beyond the first connect. */
async function getClient(strapi: Core.Strapi): Promise<RedisClientType | null> {
  ensureClient(strapi);
  if (!client) return null;
  if (client.isReady) return client;
  await Promise.race([connecting, new Promise((resolve) => setTimeout(resolve, 500))]);
  return client.isReady ? client : null;
}

/**
 * Client identity for keying. Prefers the last `X-Forwarded-For` hop appended by
 * our own ALB/CloudFront over the first (which the client controls and can
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
      // The hop becomes part of a Redis key. An arbitrary attacker-controlled string
      // would let one client mint unlimited distinct keys — evading its own limit while
      // filling Redis with short-lived counters. Only address-shaped values are keyed.
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
 * Fixed-window counter: `INCR` then `EXPIRE` on first hit. One round-trip in the
 * steady state (the pipeline is sent as a MULTI), and no Lua script to keep in
 * sync with ElastiCache's script cache.
 */
async function hit(
  redis: RedisClientType,
  key: string,
  windowSeconds: number,
): Promise<number | null> {
  try {
    const results = await redis.multi().incr(key).expire(key, windowSeconds, "NX").exec();
    const count = Number(results?.[0]);
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) => {
  const tiers: Record<string, Tier> = {
    auth: {
      name: "auth",
      limit: Number(process.env.RATE_LIMIT_AUTH ?? 10),
      windowSeconds: Number(process.env.RATE_LIMIT_AUTH_WINDOW ?? 300),
    },
    sso: {
      name: "sso",
      limit: Number(process.env.RATE_LIMIT_SSO ?? 60),
      windowSeconds: Number(process.env.RATE_LIMIT_SSO_WINDOW ?? 300),
    },
    write: {
      name: "write",
      limit: Number(process.env.RATE_LIMIT_WRITE ?? 120),
      windowSeconds: Number(process.env.RATE_LIMIT_WRITE_WINDOW ?? 60),
    },
    read: {
      name: "read",
      limit: Number(process.env.RATE_LIMIT_READ ?? 600),
      windowSeconds: Number(process.env.RATE_LIMIT_READ_WINDOW ?? 60),
    },
  };

  const enabled = process.env.RATE_LIMIT_ENABLED !== "false";
  if (!enabled) {
    strapi.log.warn("[rate-limit] disabled via RATE_LIMIT_ENABLED=false");
  } else if (!process.env.REDIS_URL) {
    strapi.log.warn(
      "[rate-limit] REDIS_URL is not set — rate limiting is INACTIVE. " +
        "Set REDIS_URL before production; see docs/adr/006-security-hardening.md",
    );
  }

  return async (ctx: RateLimitCtx, next: () => Promise<void>) => {
    if (!enabled) return next();

    const tier = tierFor(ctx.request.path, ctx.request.method, tiers);
    const redis = await getClient(strapi);
    if (!redis) return next(); // fail open — see the module doc

    const key = `${KEY_PREFIX}:${tier.name}:${clientKey(ctx)}`;
    const count = await hit(redis, key, tier.windowSeconds);
    if (count === null) return next(); // fail open

    ctx.set("X-RateLimit-Limit", String(tier.limit));
    ctx.set("X-RateLimit-Remaining", String(Math.max(0, tier.limit - count)));

    if (count > tier.limit) {
      strapi.log.warn(
        `[rate-limit] ${tier.name} tier exceeded: ${ctx.request.method} ${ctx.request.path} ` +
          `from ${clientKey(ctx)} (${count}/${tier.limit} per ${tier.windowSeconds}s)`,
      );
      ctx.set("Retry-After", String(tier.windowSeconds));
      return ctx.tooManyRequests("Rate limit exceeded. Please retry later.");
    }

    return next();
  };
};
