/**
 * Cache-tag scheme (§5.2) — the single source of truth for the tag strings
 * both the FE fetch layer and the P3 webhook → revalidateTag mapping must
 * agree on. `{id}` is always the Strapi `documentId` — the identifier is
 * stable across locales and drafts, unlike the numeric `id` which is
 * per-locale-entry.
 *
 * Pure module (no framework / Node imports) so it is safe in both the RSC
 * fetch layer and the webhook Route Handler, and safe to bundle into the
 * CMS-side `dist/index.cjs` if ever needed.
 */

export const LIST_ARTICLES_TAG = "list:articles";
export const LIST_LANDINGS_TAG = "list:landings";
export const GLOBAL_TAG = "global";

export function articleTag(documentId: string): string {
  return `article:${documentId}`;
}

export function categoryTag(slug: string): string {
  return `category:${slug}`;
}

export function tagTag(slug: string): string {
  return `tag:${slug}`;
}

export function landingTag(slug: string): string {
  return `landing:${slug}`;
}

export function pageTag(slug: string): string {
  return `page:${slug}`;
}

export function navigationTag(locale: string): string {
  return `navigation:${locale}`;
}

/**
 * The content models whose changes trigger a revalidation webhook. Matches the
 * singular content-type name Strapi exposes (`uid.split(".").pop()`), which is
 * what the CMS lifecycle sends as `model`.
 */
export type RevalidateModel =
  | "article"
  | "landing-page"
  | "page"
  | "category"
  | "tag"
  | "navigation"
  | "global";

/**
 * Webhook payload contract (§5.3). Emitted by the CMS document-service
 * middleware, consumed by `apps/web/app/api/revalidate/route.ts`. The mapping
 * to cache tags lives on the web side (`tagsForEntry`) so the FE owns its own
 * §5.2 table; the CMS only reports *what changed*.
 */
export interface RevalidatePayload {
  model: RevalidateModel;
  /** Strapi `documentId` — stable across locales/drafts. */
  documentId?: string;
  /** Per-locale numeric entry id, informational only (logs). */
  id?: number | string;
  slug?: string;
  locale?: string;
  /** Enrichment for articles (§5.2) when the relation slug is available. */
  categorySlug?: string;
  tagSlugs?: string[];
}

/**
 * Map a changed entry to the exact set of cache tags to invalidate (§5.2).
 *
 * Note on articles: clearing `list:articles` already busts every category and
 * tag *feed* (those fetches carry `list:articles`), so the extra
 * `category:{slug}`/`tag:{slug}` tags are only meaningful when a category or
 * tag entity itself changes. We still emit them for an article when the CMS
 * enriched the payload with the relation slugs, to match the §5.2 table.
 *
 * `tagSlugs` is capped (P7): it is the only unbounded field in the payload, and
 * each entry becomes a separate `revalidateTag` call. A payload claiming 100k
 * tags would turn one authenticated webhook into a self-inflicted flood of cache
 * invalidations. Real articles carry a handful.
 */
const MAX_TAG_SLUGS = 64;

export function tagsForEntry(p: RevalidatePayload): string[] {
  const tags = new Set<string>();

  switch (p.model) {
    case "article": {
      if (p.documentId) tags.add(articleTag(p.documentId));
      tags.add(LIST_ARTICLES_TAG);
      if (p.categorySlug) tags.add(categoryTag(p.categorySlug));
      const slugs = Array.isArray(p.tagSlugs) ? p.tagSlugs.slice(0, MAX_TAG_SLUGS) : [];
      for (const t of slugs) {
        if (typeof t === "string" && t.length > 0) tags.add(tagTag(t));
      }
      break;
    }
    case "landing-page": {
      if (p.slug) tags.add(landingTag(p.slug));
      tags.add(LIST_LANDINGS_TAG);
      break;
    }
    case "page": {
      if (p.slug) tags.add(pageTag(p.slug));
      break;
    }
    case "category": {
      if (p.slug) tags.add(categoryTag(p.slug));
      tags.add(LIST_ARTICLES_TAG);
      break;
    }
    case "tag": {
      if (p.slug) tags.add(tagTag(p.slug));
      tags.add(LIST_ARTICLES_TAG);
      break;
    }
    case "navigation": {
      if (p.locale) tags.add(navigationTag(p.locale));
      break;
    }
    case "global": {
      tags.add(GLOBAL_TAG);
      break;
    }
  }

  return [...tags];
}
