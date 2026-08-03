/**
 * Tenant plugin — register phase. Three wirings, all of which must be in place
 * before the first request is served.
 *
 * 1. **The condition is registered** with the admin's condition provider. It has
 *    to exist there before anything validates a permission against it
 *    (`services/condition.js` `isValidCondition`), so this happens at the
 *    earliest possible point.
 *
 * 2. **The condition is attached to every tenant-scoped permission** through the
 *    engine's `before-evaluate.permission` hook, rather than by writing
 *    `conditions: [...]` into `admin::permission` rows.
 *
 *    That choice is the important one. Storing it per-row would mean: rows that
 *    do not exist yet at boot (a role whose permissions are first saved next
 *    week) silently miss it; a super admin can un-tick it in the role editor and
 *    quietly un-scope a whole role; and every new content type needs remembering.
 *    Attaching it at ability-generation time makes it unconditional and
 *    invisible in the UI — there is nothing to forget and nothing to switch off.
 *
 * 3. **The document-service guard** is installed. Registering it here guarantees
 *    it is active before the HTTP server accepts anything — the same argument
 *    `draft-guard` makes: a guard that comes up a moment late is a guard with a
 *    hole in it.
 *
 * ### One caveat, and why layer 3 exists
 *
 * Strapi ORs the conditions on a permission together
 * (`@strapi/permissions/engine`: `{ $and: [{ $or: results }] }`). So a role that
 * also carries, say, `admin::is-creator` gets "my site OR created by me" — which
 * is *wider* than tenant scoping, not narrower. The document-service guard is
 * what makes that safe, and it is why the two layers are not redundant.
 */
import type { Core } from "@strapi/strapi";
import { createInAssignedSitesCondition } from "./conditions";
import { CONDITION_ID, isTenantScopedUid } from "./constants";
import { registerTenantScope } from "./middlewares/tenant-scope";

interface PermissionService {
  conditionProvider: { register: (condition: unknown) => unknown };
  engine: {
    hooks: Record<string, { register: (handler: (context: unknown) => unknown) => unknown }>;
  };
}

interface BeforeEvaluateContext {
  permission: { subject?: string | null; conditions?: string[] };
  addCondition: (condition: string) => unknown;
}

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const permission = strapi.service("admin::permission") as unknown as PermissionService;

  permission.conditionProvider.register(createInAssignedSitesCondition(strapi));

  permission.engine.hooks["before-evaluate.permission"].register((raw) => {
    const context = raw as BeforeEvaluateContext;
    const subject = context.permission?.subject;
    if (!subject || !isTenantScopedUid(subject)) return;
    if (context.permission.conditions?.includes(CONDITION_ID)) return;
    context.addCondition(CONDITION_ID);
  });

  strapi.log.info(`[tenant] RBAC condition ${CONDITION_ID} registered and auto-attached`);

  registerTenantScope(strapi);
};
