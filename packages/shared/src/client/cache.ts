/**
 * cacheLife profiles (§5.1/§5.2) — the time-based safety net behind tag-based
 * on-demand revalidation. Values are seconds passed as `next.revalidate` on
 * every CMS fetch; a missed webhook (P3) self-heals within this window.
 */
export const CACHE_PROFILES = {
  /** Static shell (home shell, about, legal) — rarely changes. */
  static: 60 * 60 * 24,
  /** Article / landing / page detail, navigation, global — hourly SWR. */
  content: 60 * 60,
  /** Article list, category, tag — short SWR to surface new publishes fast. */
  list: 60 * 10,
} as const satisfies Record<string, number>;

export type CacheProfile = keyof typeof CACHE_PROFILES;
