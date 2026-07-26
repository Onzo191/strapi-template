/**
 * Cache-tag scheme (§5.2) — the single source of truth for the tag strings
 * both the FE fetch layer and the (future, P3) webhook → revalidateTag
 * mapping must agree on. `{id}` is always the Strapi `documentId` — the
 * identifier is stable across locales and drafts, unlike the numeric `id`
 * which is per-locale-entry.
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
