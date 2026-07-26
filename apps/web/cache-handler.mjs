// @ts-check
/**
 * Custom Next.js `cacheHandler` backed by Redis (§1 "Cache consistency across
 * instances", §5.3). This is what makes content freshness *cluster-wide*: the
 * default filesystem/in-memory cache is per-instance, so a `revalidateTag()`
 * triggered by a webhook on instance A would never clear instance B. Backing
 * both the cached entries and the tag-invalidation timestamps with a shared
 * Redis (ElastiCache in prod) means any instance's revalidation is instantly
 * seen by every instance on its next read.
 *
 * Wired via `next.config.ts` (`cacheHandler` + `cacheMaxMemorySize: 0`, so no
 * instance-local memory layer can shadow Redis and serve stale HTML).
 *
 * Design mirrors Next's own FileSystemCache tag semantics so behaviour is
 * identical, only the store is shared:
 *   - Entries live at `<prefix>:entry:<key>` as JSON.
 *   - Per-tag invalidation timestamps live in the hash `<prefix>:tags`
 *     (`{ expired?, stale? }` in ms), the distributed equivalent of Next's
 *     in-process `tagsManifest`.
 *   - `get()` treats an entry as a MISS when any of its tags was invalidated
 *     after the entry's `lastModified` — same rule as `areTagsExpired`.
 *
 * Time-based revalidation (the §5.1 `cacheLife` safety net) is untouched: we
 * return an accurate `lastModified` and Next's IncrementalCache still applies
 * the per-route `revalidate` window. So a *dropped* webhook self-heals.
 *
 * Redis is treated as best-effort: any connection error degrades to a cache
 * MISS (regenerate from origin) or a no-op write — the site stays up, it just
 * loses the shared-cache optimisation until Redis returns.
 */
import { createClient } from "redis";

const NEXT_CACHE_TAGS_HEADER = "x-next-cache-tags";

const PREFIX = process.env.REDIS_CACHE_PREFIX ?? "vng:next:cache:v1";
const ENTRY_PREFIX = `${PREFIX}:entry:`;
const TAGS_KEY = `${PREFIX}:tags`;
// Optional GC ceiling so abandoned entries don't grow Redis unbounded. Next
// still owns *staleness*; this is only a floor for eviction. 0 = no expiry.
const ENTRY_TTL_SECONDS = Number(process.env.REDIS_CACHE_TTL_SECONDS ?? 0);

// How long a single `getClient()` call will wait for the initial connection
// before giving up and returning null. Bounded so Redis being down (e.g. during
// `next build` with no Redis running) NEVER blocks page generation — it just
// degrades to no-cache. node-redis keeps reconnecting in the background, so the
// handler self-heals the moment Redis returns.
const CONNECT_WAIT_MS = 1200;

/** @type {ReturnType<typeof createClient> | null} */
let client = null;
/** @type {Promise<unknown> | null} */
let readyPromise = null;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Create the shared client once and kick off a non-blocking background connect. */
function ensureClient() {
  if (client) return;
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  client = createClient({
    url,
    socket: {
      // Fail a single connect attempt fast, then keep retrying with capped
      // backoff so a transient Redis blip self-heals without ever giving up.
      connectTimeout: 1000,
      reconnectStrategy: (retries) => Math.min(2000, 100 + retries * 100),
    },
  });
  // An 'error' listener is mandatory — without it node-redis throws on every
  // failed reconnect. `isReady` (checked below) gates actual usage.
  client.on("error", (err) => {
    if (process.env.CACHE_HANDLER_DEBUG) {
      console.error("[cache-handler] redis error", err?.message ?? err);
    }
  });
  // Fire-and-forget: connection readiness is observed via `client.isReady`.
  readyPromise = client.connect().catch((err) => {
    console.error(
      "[cache-handler] initial redis connect failed — degrading to no-cache:",
      err?.message ?? err,
    );
  });
}

/**
 * Return a ready client, or null if Redis is unreachable within the bounded
 * wait. Never throws, never blocks longer than `CONNECT_WAIT_MS`.
 */
async function getClient() {
  ensureClient();
  if (client?.isReady) return client;
  // Wait briefly for the very first connection; once `readyPromise` settles
  // this returns immediately on every subsequent call (no repeated blocking).
  await Promise.race([readyPromise, delay(CONNECT_WAIT_MS)]);
  return client?.isReady ? client : null;
}

/**
 * JSON replacer/reviver that survives the Buffers and Maps Next stores in
 * cache values (`rscData`, route `body`, PPR `segmentData`). `this[key]` is
 * the *original* value (before any `toJSON`), so Buffers are detectable.
 */
function replacer(key, value) {
  const original = this[key];
  if (Buffer.isBuffer(original)) {
    return { __t: "Buffer", d: original.toString("base64") };
  }
  if (original instanceof Map) {
    return { __t: "Map", d: Array.from(original.entries()) };
  }
  return value;
}

function reviver(_key, value) {
  if (value && typeof value === "object") {
    if (value.__t === "Buffer" && typeof value.d === "string") {
      return Buffer.from(value.d, "base64");
    }
    if (value.__t === "Map" && Array.isArray(value.d)) {
      return new Map(value.d);
    }
  }
  return value;
}

/**
 * Distributed equivalent of Next's `areTagsExpired`: an entry is expired if any
 * of its tags was invalidated (`expired` timestamp) strictly after the entry
 * was written, and that invalidation is already in effect (`expired <= now`).
 * @param {Array<{expired?: number, stale?: number} | null>} records
 * @param {number} lastModified
 */
function anyTagExpired(records, lastModified) {
  const now = Date.now();
  for (const rec of records) {
    const expiredAt = rec?.expired;
    if (typeof expiredAt === "number" && expiredAt <= now && expiredAt > lastModified) {
      return true;
    }
  }
  return false;
}

export default class RedisCacheHandler {
  /** @param {{ revalidatedTags?: string[] }} ctx */
  constructor(ctx) {
    // Tags revalidated within *this* request (on-demand revalidate on the
    // instance that received the webhook). Redis covers every other instance.
    this.revalidatedTags = ctx?.revalidatedTags ?? [];
  }

  /**
   * @param {string} key
   * @param {any} ctx
   * @returns {Promise<{ lastModified: number, value: any } | null>}
   */
  async get(key, ctx) {
    const c = await getClient();
    if (!c) return null;

    let raw;
    try {
      raw = await c.get(ENTRY_PREFIX + key);
    } catch {
      return null;
    }
    if (!raw) return null;

    /** @type {{ lastModified: number, value: any }} */
    let entry;
    try {
      entry = JSON.parse(raw, reviver);
    } catch {
      return null;
    }

    const kind = entry.value?.kind;
    /** @type {string[]} */
    let relevantTags = [];

    if (kind === "APP_PAGE" || kind === "APP_ROUTE" || kind === "PAGES") {
      const header = entry.value?.headers?.[NEXT_CACHE_TAGS_HEADER];
      if (typeof header === "string" && header.length > 0) {
        relevantTags = header.split(",");
      }
    } else if (kind === "FETCH") {
      relevantTags = [...(ctx?.tags ?? []), ...(ctx?.softTags ?? [])];
    }

    if (relevantTags.length === 0) return entry;

    // On-demand revalidate in the current request → never serve stale.
    if (relevantTags.some((t) => this.revalidatedTags.includes(t))) {
      return null;
    }

    // Cluster-wide check: was any tag invalidated on another instance?
    try {
      const records = await c.hmGet(TAGS_KEY, relevantTags);
      const parsed = records.map((r) => (r ? safeParse(r) : null));
      if (anyTagExpired(parsed, entry.lastModified)) {
        return null;
      }
    } catch {
      // If we can't reach the tag manifest, fall back to serving the entry;
      // the time-based safety net still bounds staleness.
    }

    return entry;
  }

  /**
   * @param {string} key
   * @param {any} data
   * @param {any} _ctx
   */
  async set(key, data, _ctx) {
    if (!data) return;
    const c = await getClient();
    if (!c) return;

    const entry = { lastModified: Date.now(), value: data };
    let serialized;
    try {
      serialized = JSON.stringify(entry, replacer);
    } catch (err) {
      console.error("[cache-handler] serialize failed", err);
      return;
    }

    try {
      if (ENTRY_TTL_SECONDS > 0) {
        await c.set(ENTRY_PREFIX + key, serialized, { EX: ENTRY_TTL_SECONDS });
      } else {
        await c.set(ENTRY_PREFIX + key, serialized);
      }
    } catch (err) {
      if (process.env.CACHE_HANDLER_DEBUG) {
        console.error("[cache-handler] set failed", err);
      }
    }
  }

  /**
   * Cluster-wide tag invalidation. Called by Next when `revalidateTag()` /
   * `revalidatePath()` run in the /api/revalidate Route Handler. Writing the
   * timestamp to shared Redis is precisely what makes the webhook clear the
   * cache on every instance, not just the one that received it.
   * @param {string | string[]} tags
   * @param {{ expire?: number } | undefined} durations
   */
  async revalidateTag(tags, durations) {
    const list = typeof tags === "string" ? [tags] : tags;
    if (!list || list.length === 0) return;

    const c = await getClient();
    if (!c) {
      console.error("[cache-handler] revalidateTag but redis unavailable:", list.join(","));
      return;
    }

    const now = Date.now();
    try {
      // Merge with any existing record per tag, mirroring FileSystemCache.
      const existing = await c.hmGet(TAGS_KEY, list);
      /** @type {Record<string, string>} */
      const updates = {};
      list.forEach((tag, i) => {
        const prev = existing[i] ? safeParse(existing[i]) : {};
        const rec = { ...prev };
        if (durations) {
          rec.stale = now;
          if (durations.expire !== undefined) rec.expired = now + durations.expire * 1000;
        } else {
          rec.expired = now;
        }
        updates[tag] = JSON.stringify(rec);
      });
      await c.hSet(TAGS_KEY, updates);
    } catch (err) {
      console.error("[cache-handler] revalidateTag failed", err);
    }
  }

  resetRequestCache() {
    // No request-scoped memory layer — every read consults shared Redis.
  }
}

/** @returns {{expired?: number, stale?: number}} */
function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
