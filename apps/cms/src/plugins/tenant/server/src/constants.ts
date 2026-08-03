/**
 * Tenant constants — the single source of truth for *what is scoped* and for the
 * identifiers Strapi computes from a plugin name. Both the RBAC condition, the
 * document-service guard and the bootstrap backfill read this list, so adding a
 * content type to multi-tenancy is one edit here plus the `site` relation in its
 * schema.
 */

/** Content types whose entries belong to exactly one site. */
export const TENANT_SCOPED_UIDS = [
  "api::page.page",
  "api::article.article",
  "api::landing-page.landing-page",
  "api::navigation.navigation",
  "api::category.category",
  "api::tag.tag",
  "api::author.author",
  "api::redirect.redirect",
] as const;

export type TenantScopedUid = (typeof TENANT_SCOPED_UIDS)[number];

const SCOPED = new Set<string>(TENANT_SCOPED_UIDS);

export function isTenantScopedUid(uid: string): uid is TenantScopedUid {
  return SCOPED.has(uid);
}

/** The site content type itself — scoped by its own `documentId`, not by a relation. */
export const SITE_UID = "api::site.site";

/** The plugin's own assignment table. Read/written with `strapi.db.query` only. */
export const ASSIGNMENT_UID = "plugin::tenant.site-assignment";

export const PLUGIN_ID = "tenant";

/**
 * Ids Strapi derives from `{ name, plugin }`. Hard-coded rather than recomputed
 * because they are written into `admin::permission.conditions` rows in the
 * database — a change here silently orphans every stored permission, so the
 * value is spelled out where it can be seen.
 *
 * Format comes from `@strapi/admin` `domain/condition.computeConditionId` /
 * `domain/action.computeActionId`: a non-`admin` plugin yields
 * `plugin::<plugin>.<name>`.
 */
export const CONDITION_NAME = "in-assigned-sites";
export const CONDITION_ID = `plugin::${PLUGIN_ID}.${CONDITION_NAME}`;
export const MANAGE_ACTION_UID = "manage";
export const MANAGE_ACTION_ID = `plugin::${PLUGIN_ID}.${MANAGE_ACTION_UID}`;

/**
 * Slug-bearing types: the guard slugifies an empty slug and enforces uniqueness
 * per `(site, locale, slug)`.
 *
 * These fields used to be Strapi `uid`s, which are unique per locale across the
 * WHOLE instance — so a second site could never have its own `/about`. Dropping
 * to `string` moves uniqueness into the guard, at the cost of the content
 * manager's auto-generate button; `sourceField` is what the guard slugifies from
 * in its place.
 */
export const SLUG_SOURCES: Record<string, { slugField: string; sourceField: string }> = {
  "api::page.page": { slugField: "slug", sourceField: "title" },
  "api::article.article": { slugField: "slug", sourceField: "title" },
  "api::landing-page.landing-page": { slugField: "slug", sourceField: "title" },
  "api::category.category": { slugField: "slug", sourceField: "name" },
  "api::tag.tag": { slugField: "slug", sourceField: "name" },
  "api::author.author": { slugField: "slug", sourceField: "name" },
  // `redirect` has no slug, but `from` is the same kind of per-site unique key —
  // it lost its global `unique: true` when redirects became per-site.
  "api::redirect.redirect": { slugField: "from", sourceField: "from" },
};
