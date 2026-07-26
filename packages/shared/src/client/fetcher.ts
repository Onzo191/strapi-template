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
  /**
   * Draft-read API token (§6.3 preview). Distinct from `apiToken` because the
   * public token must NOT be able to read unpublished content; only the preview
   * flow (a signed `draftMode` session) uses this one.
   */
  previewToken?: string;
}

export interface StrapiRequestOptions {
  tags: string[];
  profile: CacheProfile;
  /**
   * Draft preview (§6.3). When true: request `status=draft`, authenticate with
   * `previewToken`, and bypass the ISR cache entirely (`no-store`) so an editor
   * always sees the latest draft — never a cached published copy.
   */
  preview?: boolean;
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
  // Preview reads the draft version and must never be served from the ISR cache.
  const effectiveQuery = options.preview ? { ...query, status: "draft" } : query;
  const token = options.preview ? (config.previewToken ?? config.apiToken) : config.apiToken;

  const qs = toQueryString(effectiveQuery);
  const url = `${config.baseUrl}/api${path}${qs ? `?${qs}` : ""}`;

  const init: FetchInit = {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    ...(options.preview
      ? { cache: "no-store" }
      : { next: { tags: options.tags, revalidate: CACHE_PROFILES[options.profile] } }),
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
