/**
 * Public read permissions (§4.4/§6 — the FE reads these over the public REST
 * API). Strapi's `public` role ships with zero permissions; without this every
 * `find`/`findOne` 403s. Idempotent — only inserts actions that aren't already
 * granted, so an editor enabling extra public actions in the admin UI is
 * never clobbered on the next boot.
 */
import type { Core } from "@strapi/strapi";

const PUBLIC_READ_ACTIONS = [
  "api::article.article.find",
  "api::article.article.findOne",
  "api::landing-page.landing-page.find",
  "api::landing-page.landing-page.findOne",
  "api::page.page.find",
  "api::page.page.findOne",
  "api::category.category.find",
  "api::category.category.findOne",
  "api::tag.tag.find",
  "api::tag.tag.findOne",
  "api::author.author.find",
  "api::author.author.findOne",
  "api::navigation.navigation.find",
  "api::navigation.navigation.findOne",
  "api::global.global.find",
];

export async function ensurePublicReadPermissions(strapi: Core.Strapi): Promise<void> {
  const publicRole = await strapi.db
    .query("plugin::users-permissions.role")
    .findOne({ where: { type: "public" } });
  if (!publicRole) return;

  const existing: Array<{ action: string }> = await strapi.db
    .query("plugin::users-permissions.permission")
    .findMany({ where: { role: publicRole.id }, select: ["action"] });
  const existingActions = new Set(existing.map((permission) => permission.action));

  const missing = PUBLIC_READ_ACTIONS.filter((action) => !existingActions.has(action));
  if (missing.length === 0) return;

  for (const action of missing) {
    await strapi.db
      .query("plugin::users-permissions.permission")
      .create({ data: { action, role: publicRole.id } });
  }
  strapi.log.info(`[bootstrap] granted public read permission for ${missing.length} action(s)`);
}
