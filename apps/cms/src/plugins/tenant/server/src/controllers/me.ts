/**
 * The current user's own tenant context — "which websites can I work on, and
 * which one am I working on right now".
 *
 * These two routes are the only ones in the plugin that are not super-admin
 * gated, because they are what every editor needs after logging in. They are
 * also, for the same reason, the plugin's main attack surface: `setActive` is
 * the one place a user influences their own scope, so the membership check in
 * the assignment service is not optional politeness.
 */
import type { Core } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import { SUPER_ADMIN_CODE } from "../../../../editorial/server/src/constants/rbac";
import { SITE_UID } from "../constants";

interface Ctx {
  request: { body: Record<string, unknown> };
  state?: { user?: { id?: number; roles?: Array<{ code?: string }> } };
  body: unknown;
}

interface SiteRow {
  documentId: string;
  key: string;
  name: string;
  domains?: unknown;
  defaultLocale?: string;
  isActive?: boolean;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /** Sites the caller may work on, plus the active one. */
  async sites(ctx: Ctx) {
    const user = ctx.state?.user;
    if (!user?.id) throw new errors.UnauthorizedError();

    const isSuperAdmin = (user.roles ?? []).some((role) => role?.code === SUPER_ADMIN_CODE);
    const assignment = strapi.plugin("tenant").service("assignment");

    // A super admin is not assigned sites — they see all of them, so "my sites"
    // is the full list rather than an empty one.
    const documentIds: string[] = isSuperAdmin
      ? []
      : await assignment.visibleSiteDocumentIds(user.id);

    const where = isSuperAdmin ? {} : { documentId: { $in: documentIds } };
    const sites = (await strapi.db.query(SITE_UID).findMany({
      where,
      orderBy: { name: "asc" },
    })) as SiteRow[];

    const active = await assignment.activeSiteFor(user.id);

    ctx.body = {
      data: {
        isSuperAdmin,
        activeSiteDocumentId: active?.siteDocumentId ?? null,
        sites,
      },
    };
  },

  /** Switch the working site. Body: `{ siteDocumentId }`. */
  async setActive(ctx: Ctx) {
    const user = ctx.state?.user;
    if (!user?.id) throw new errors.UnauthorizedError();

    const siteDocumentId = ctx.request.body?.siteDocumentId;
    if (typeof siteDocumentId !== "string" || siteDocumentId === "") {
      throw new errors.ValidationError("siteDocumentId là bắt buộc.");
    }

    const isSuperAdmin = (user.roles ?? []).some((role) => role?.code === SUPER_ADMIN_CODE);
    const row = await strapi
      .plugin("tenant")
      .service("assignment")
      .setActiveSite(user.id, siteDocumentId, { allowAny: isSuperAdmin });

    ctx.body = { data: { activeSiteDocumentId: row.siteDocumentId } };
  },
});
