/**
 * Tenant plugin — bootstrap.
 *
 * Registers the RBAC action that gates the tenant console, and performs the
 * one-shot assignment backfill so that turning multi-tenancy on does not lock
 * every existing editor out of the CMS.
 */
import type { Core } from "@strapi/strapi";
import { SUPER_ADMIN_CODE } from "../../../editorial/server/src/constants/rbac";
import {
  ASSIGNMENT_UID,
  MANAGE_ACTION_ID,
  MANAGE_ACTION_UID,
  PLUGIN_ID,
  SITE_UID,
} from "./constants";
import { ensureSites } from "./site-provision";

interface AdminUserRow {
  id: number;
  email: string;
  roles?: Array<{ code: string }>;
}

/**
 * Attach every pre-existing admin user to the default site — but only on the very
 * first boot after this plugin lands, detected by the assignment table being
 * completely empty.
 *
 * The "table is empty" guard is doing real work. A simpler rule ("any user with
 * no assignment gets the default site") would silently re-grant access every
 * night to exactly the people a super admin had just revoked — turning the
 * revoke button into a no-op with a delay on it.
 */
async function backfillAssignments(strapi: Core.Strapi): Promise<void> {
  const existing = await strapi.db.query(ASSIGNMENT_UID).count();
  if (existing > 0) return;

  const site = (await strapi.db.query(SITE_UID).findOne({ orderBy: { id: "asc" } })) as {
    documentId: string;
    key: string;
  } | null;
  if (!site) {
    strapi.log.warn("[tenant] no site exists yet — skipping the initial assignment backfill.");
    return;
  }

  const users = (await strapi.db.query("admin::user").findMany({
    populate: ["roles"],
  })) as AdminUserRow[];

  let granted = 0;
  for (const user of users) {
    // Super admins are unscoped by design; giving them a row would only add a
    // meaningless active-site flag.
    if ((user.roles ?? []).some((role) => role.code === SUPER_ADMIN_CODE)) continue;

    await strapi.db.query(ASSIGNMENT_UID).create({
      data: {
        adminUserId: user.id,
        siteKey: site.key,
        siteDocumentId: site.documentId,
        isActiveSite: true,
      },
    });
    granted += 1;
  }

  strapi.log.info(
    `[tenant] initial backfill: ${granted} admin user(s) assigned to site "${site.key}".`,
  );
}

export default async ({ strapi }: { strapi: Core.Strapi }) => {
  const permission = strapi.service("admin::permission") as {
    actionProvider: { registerMany: (actions: unknown[]) => Promise<unknown> };
  };

  /**
   * `plugin::tenant.manage` gates the tenant console. It is registered but
   * granted to **no role**: super admins bypass ability checks entirely, so they
   * see the menu entry and nobody else does. The routes are gated independently
   * by the `is-super-admin` policy — hiding a menu item hides a menu item, and
   * the URL can still be typed.
   */
  await permission.actionProvider.registerMany([
    {
      uid: MANAGE_ACTION_UID,
      displayName: "Quản trị website & phân quyền tenant",
      pluginName: PLUGIN_ID,
      section: "plugins",
    },
  ]);
  strapi.log.info(`[tenant] registered RBAC action ${MANAGE_ACTION_ID}`);

  // Order matters and it is not obvious: Strapi runs every *plugin* bootstrap
  // before the application's own (`runPluginsLifecycles(BOOTSTRAP)` → providers →
  // user lifecycles). So the default site has to be created here, not in
  // `src/index.ts` — from there it would land after this backfill and the first
  // boot would assign nobody.
  await ensureSites(strapi);
  await backfillAssignments(strapi);
};
