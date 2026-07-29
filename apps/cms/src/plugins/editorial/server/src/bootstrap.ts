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
  // Let Strapi create its OWN default roles first — above all `strapi-super-admin`.
  //
  // This is not defensive tidiness, it is load-bearing. Strapi provisions its
  // defaults with `createRolesIfNoneExist()`, a *none exist* guard, and it runs in
  // the admin **provider** bootstrap, which Strapi sequences AFTER every plugin
  // bootstrap (Strapi.js: runPluginsLifecycles(BOOTSTRAP) → providers → user
  // lifecycles). So on an empty database the five roles below would land first, the
  // guard would see roles already present, and Strapi would skip its defaults
  // entirely — leaving an installation with **no super-admin role at all**. The
  // symptom is remote from the cause: "Your application doesn't have a super admin
  // role", an admin panel stuck on "create first administrator", and no way to
  // grant anyone full access.
  //
  // Calling it here is safe and idempotent: it is the same function Strapi is about
  // to call, and once the defaults exist Strapi's own call becomes the no-op instead.
  const roleService = strapi.service("admin::role") as {
    createRolesIfNoneExist: () => Promise<unknown>;
  };
  await roleService.createRolesIfNoneExist();

  for (const seed of ROLE_SEEDS) {
    const existing = await strapi.db.query("admin::role").findOne({ where: { code: seed.code } });
    if (existing) continue;

    await strapi.db.query("admin::role").create({
      data: { name: seed.name, code: seed.code, description: seed.description },
    });
    strapi.log.info(`[editorial] provisioned admin role "${seed.name}" (${seed.code})`);
  }
};
