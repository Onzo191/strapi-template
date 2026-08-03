/**
 * RBAC condition "the entry belongs to a site I am assigned to" (L2).
 *
 * ## Why this works on Community edition
 *
 * It is the same machinery Strapi's own `Author` role uses to see only its own
 * entries. `@strapi/admin` exposes `conditionProvider.register()` in CE
 * (`services/permission.js`), the permission engine `await`s the handler
 * (`@strapi/permissions/engine`: `await condition.handler(...)`) so a DB lookup
 * here is legitimate, and `@strapi/content-manager`'s permission checker turns
 * the returned object into query `filters` on every list, count and detail read.
 * Nothing in that path is Enterprise-gated.
 *
 * ## What it does NOT do
 *
 * It only reaches queries that go through the admin permission engine. Custom
 * endpoints, plugin code and single reads by `documentId` are covered by the
 * document-service guard instead (`middlewares/tenant-scope.ts`). Neither layer
 * is sufficient alone: this one makes the UI correct, that one makes it safe.
 */
import type { Core } from "@strapi/strapi";
import { SUPER_ADMIN_CODE } from "../../../editorial/server/src/constants/rbac";
import { CONDITION_NAME, PLUGIN_ID } from "./constants";

interface ConditionUser {
  id: number;
  roles?: Array<{ code?: string }>;
}

export function createInAssignedSitesCondition(strapi: Core.Strapi) {
  return {
    displayName: "Thuộc website được phân quyền",
    name: CONDITION_NAME,
    plugin: PLUGIN_ID,
    async handler(user: ConditionUser) {
      // `true` means "no constraint" to the engine — the permission is registered
      // without a filter. Super admins administer the tenants, so they are never
      // scoped by one. Handled here rather than by skipping the attachment, so
      // there is exactly one place that decides who is exempt.
      if ((user.roles ?? []).some((role) => role?.code === SUPER_ADMIN_CODE)) return true;

      const scope: string[] = await strapi
        .plugin(PLUGIN_ID)
        .service("assignment")
        .visibleSiteDocumentIds(user.id);

      // `$in: []` matches nothing. That is deliberate and it is the whole safety
      // property of this function: a user with no assignment sees an empty CMS,
      // never the full one. Returning `{}` here — the tempting "no constraint"
      // shortcut — would grant every tenant to every unassigned user.
      return { site: { documentId: { $in: scope } } };
    },
  };
}
