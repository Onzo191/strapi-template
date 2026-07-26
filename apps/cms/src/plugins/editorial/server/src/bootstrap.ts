/**
 * Provision the five VNG admin roles (§4.5 / Req §4). Idempotent — mirrors the
 * app's `ensurePublicReadPermissions` pattern: only inserts roles whose `code`
 * doesn't already exist, so re-boots and manual edits are never clobbered.
 *
 * The transition RBAC keys off these role codes (constants/rbac.ts). Fine-grained
 * admin-panel permissions per role are configured in the admin UI; here we only
 * guarantee the roles exist so users can be assigned to them.
 */
import type { Core } from "@strapi/strapi";
import { ROLE_SEEDS } from "./constants/rbac";

export default async ({ strapi }: { strapi: Core.Strapi }) => {
  for (const seed of ROLE_SEEDS) {
    const existing = await strapi.db.query("admin::role").findOne({ where: { code: seed.code } });
    if (existing) continue;

    await strapi.db.query("admin::role").create({
      data: { name: seed.name, code: seed.code, description: seed.description },
    });
    strapi.log.info(`[editorial] provisioned admin role "${seed.name}" (${seed.code})`);
  }
};
