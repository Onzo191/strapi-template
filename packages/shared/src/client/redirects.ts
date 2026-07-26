/**
 * 301/302 redirect resolver (§6.3, Req §6 — the 297 legacy-404 map).
 *
 * Designed to run inside Next.js middleware (`apps/web/proxy.ts`), so it is
 * framework-free and never throws into the request path: if the CMS is
 * unreachable it fails OPEN (returns `null` → normal routing proceeds) rather
 * than 500-ing every request.
 *
 * The full redirect table (297 rows — tiny) is fetched once and cached in
 * module memory with a short TTL, so the common case is a `Map` lookup with no
 * per-request round-trip. The TTL doubles as the safety net for a missed cache
 * bust; publishing a redirect self-heals within `ttlMs`.
 */

export interface RedirectHit {
  to: string;
  /** 301 (permanent) or 302 (temporary), from the `redirect` content type. */
  statusCode: number;
}

export interface RedirectResolverConfig {
  /** Strapi base URL, e.g. the internal `http://cms:1337`. */
  baseUrl: string;
  /** Optional bearer token; the resolver works against the public `find` too. */
  apiToken?: string;
  /** Cache lifetime in ms (default 60_000). */
  ttlMs?: number;
}

interface RedirectRow {
  from: string;
  to: string;
  permanent: boolean;
  statusCode: number | null;
}

/** Normalize a pathname for matching: ensure leading slash, drop trailing slash. */
export function normalizeRedirectPath(path: string): string {
  let p = path.trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

export function createRedirectResolver(config: RedirectResolverConfig) {
  const ttlMs = config.ttlMs ?? 60_000;
  let cache: Map<string, RedirectHit> | null = null;
  let expiresAt = 0;
  let inflight: Promise<Map<string, RedirectHit>> | null = null;

  async function fetchAll(): Promise<Map<string, RedirectHit>> {
    const map = new Map<string, RedirectHit>();
    const headers = config.apiToken ? { Authorization: `Bearer ${config.apiToken}` } : undefined;

    for (let page = 1; ; page += 1) {
      const qs =
        "fields[0]=from&fields[1]=to&fields[2]=statusCode&fields[3]=permanent" +
        `&pagination[page]=${page}&pagination[pageSize]=100`;
      const res = await fetch(`${config.baseUrl}/api/redirects?${qs}`, {
        headers,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`redirect fetch failed: ${res.status}`);

      const json = (await res.json()) as {
        data: RedirectRow[];
        meta: { pagination: { pageCount: number } };
      };
      for (const row of json.data) {
        map.set(normalizeRedirectPath(row.from), {
          to: row.to,
          statusCode: row.statusCode ?? (row.permanent ? 301 : 302),
        });
      }
      if (page >= (json.meta?.pagination?.pageCount ?? 1)) break;
    }
    return map;
  }

  async function ensureCache(): Promise<Map<string, RedirectHit>> {
    if (cache && Date.now() < expiresAt) return cache;
    if (!inflight) {
      inflight = fetchAll()
        .then((map) => {
          cache = map;
          expiresAt = Date.now() + ttlMs;
          return map;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  return {
    /** Resolve a pathname to its redirect target, or `null` if none / on error. */
    async resolve(path: string): Promise<RedirectHit | null> {
      try {
        const map = await ensureCache();
        return map.get(normalizeRedirectPath(path)) ?? null;
      } catch {
        // Fail open — serve the request normally rather than erroring.
        return cache?.get(normalizeRedirectPath(path)) ?? null;
      }
    },
  };
}

export type RedirectResolver = ReturnType<typeof createRedirectResolver>;
