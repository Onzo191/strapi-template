/**
 * User ↔ site assignment for the super-admin console.
 *
 * Every change is written to the editorial audit log. "Who granted whom access
 * to which website" is the compliance-relevant fact and it is invisible if only
 * the end state is stored — the same reasoning that made the editorial trail
 * append-only (ADR-004).
 */
import type { Core } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import { SUPER_ADMIN_CODE } from "../../../../editorial/server/src/constants/rbac";
import { ASSIGNMENT_UID, SITE_UID } from "../constants";

interface Ctx {
  request: { body: Record<string, unknown> };
  params: Record<string, string>;
  state?: { user?: { id?: number; email?: string } };
  body: unknown;
}

interface AdminUserRow {
  id: number;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  isActive: boolean;
  roles?: Array<{ code: string; name: string }>;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /** Every admin user with the sites they can work on — the console's matrix. */
  async find(ctx: Ctx) {
    const users = (await strapi.db.query("admin::user").findMany({
      populate: ["roles"],
      orderBy: { email: "asc" },
    })) as AdminUserRow[];

    const rows = (await strapi.db.query(ASSIGNMENT_UID).findMany({})) as Array<{
      adminUserId: number;
      siteDocumentId: string;
      isActiveSite: boolean;
    }>;

    const byUser = new Map<number, string[]>();
    for (const row of rows) {
      const list = byUser.get(row.adminUserId) ?? [];
      list.push(row.siteDocumentId);
      byUser.set(row.adminUserId, list);
    }

    ctx.body = {
      data: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: [user.firstname, user.lastname].filter(Boolean).join(" ").trim() || null,
        isActive: user.isActive,
        // A super admin is unscoped by design; the UI shows that instead of an
        // empty checkbox row, which would read as "has access to nothing".
        isSuperAdmin: (user.roles ?? []).some((role) => role.code === SUPER_ADMIN_CODE),
        roles: (user.roles ?? []).map((role) => role.name),
        siteDocumentIds: byUser.get(user.id) ?? [],
      })),
    };
  },

  /** Replace one user's site list. Body: `{ siteDocumentIds: string[] }`. */
  async set(ctx: Ctx) {
    const adminUserId = Number(ctx.params.userId);
    if (!Number.isInteger(adminUserId)) {
      throw new errors.ValidationError("userId không hợp lệ.");
    }

    const requested = ctx.request.body?.siteDocumentIds;
    if (!Array.isArray(requested) || requested.some((id) => typeof id !== "string")) {
      throw new errors.ValidationError("siteDocumentIds phải là mảng chuỗi.");
    }

    const user = (await strapi.db.query("admin::user").findOne({
      where: { id: adminUserId },
      populate: ["roles"],
    })) as AdminUserRow | null;
    if (!user) throw new errors.NotFoundError("Người dùng không tồn tại.");

    // Assigning sites to a super admin would imply they are scoped by them. They
    // are not, and a UI that suggests otherwise is worse than one that refuses.
    if ((user.roles ?? []).some((role) => role.code === SUPER_ADMIN_CODE)) {
      throw new errors.ValidationError(
        "Super Admin không cần phân quyền website — họ truy cập được tất cả.",
      );
    }

    const { granted, revoked } = await strapi
      .plugin("tenant")
      .service("assignment")
      .replaceAssignments(adminUserId, requested as string[]);

    const actor = ctx.state?.user;
    const audit = strapi.plugin("editorial").service("audit");
    for (const site of granted) {
      await audit.record({
        action: "tenant.grant",
        contentType: SITE_UID,
        entryDocumentId: site.documentId,
        entryTitle: site.name,
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        reason: `→ ${user.email}`,
      });
    }
    for (const row of revoked) {
      await audit.record({
        action: "tenant.revoke",
        contentType: SITE_UID,
        entryDocumentId: row.siteDocumentId,
        entryTitle: row.siteKey,
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        reason: `→ ${user.email}`,
      });
    }

    ctx.body = {
      data: {
        adminUserId,
        siteDocumentIds: await strapi
          .plugin("tenant")
          .service("assignment")
          .visibleSiteDocumentIds(adminUserId),
        granted: granted.length,
        revoked: revoked.length,
      },
    };
  },
});
