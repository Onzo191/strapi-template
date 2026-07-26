/**
 * Low-level Strapi REST fetcher. Every call is tagged (`next.tags`) per the
 * §5.2 cache-tag scheme and time-boxed by a cacheLife profile (`next.revalidate`,
 * §5.1) — the safety net a missed webhook (P3) self-heals against.
 *
 * `next: { tags, revalidate }` is a plain extra property Next.js's patched
 * `fetch` reads at runtime; this module has no dependency on `next` itself,
 * so it stays safe to bundle into the CMS-side `dist/index.cjs` too.
 */
import { CACHE_PROFILES, type CacheProfile } from "./cache";
import { toQueryString } from "./qs";

export interface StrapiClientConfig {
  /** Strapi base URL, e.g. `http://localhost:1337` or the internal `http://cms:1337`. */
  baseUrl: string;
  /** Optional read-only API token (Bearer) for non-public content. */
  apiToken?: string;
}

export interface StrapiRequestOptions {
  tags: string[];
  profile: CacheProfile;
}

export class StrapiNotFoundError extends Error {
  constructor(path: string) {
    super(`Strapi resource not found: ${path}`);
    this.name = "StrapiNotFoundError";
  }
}

/**
 * `next: { tags, revalidate }` is Next.js's patched-`fetch` extension — not
 * part of the standard `RequestInit` this package's DOM-less tsconfig sees.
 * Widening the init object explicitly (rather than an inline literal) keeps
 * this structurally assignable without an `any` cast.
 */
type FetchInit = RequestInit & {
  next?: { tags: string[]; revalidate: number };
};

export async function strapiRequest<T>(
  config: StrapiClientConfig,
  path: string,
  query: Record<string, unknown>,
  options: StrapiRequestOptions,
): Promise<T> {
  const qs = toQueryString(query);
  const url = `${config.baseUrl}/api${path}${qs ? `?${qs}` : ""}`;

  const init: FetchInit = {
    headers: config.apiToken ? { Authorization: `Bearer ${config.apiToken}` } : undefined,
    next: {
      tags: options.tags,
      revalidate: CACHE_PROFILES[options.profile],
    },
  };

  const res = await fetch(url, init);

  if (res.status === 404) {
    throw new StrapiNotFoundError(path);
  }
  if (!res.ok) {
    throw new Error(`Strapi request failed: ${res.status} ${res.statusText} (${url})`);
  }

  return (await res.json()) as T;
}
