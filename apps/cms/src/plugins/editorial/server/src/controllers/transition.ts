/**
 * Transition controller. Admin-authenticated; the acting admin user
 * (`ctx.state.user`, with roles) is handed to the service, which enforces the
 * RBAC matrix. Strapi maps thrown `errors.*` to the right HTTP status
 * (Forbidden → 403, Validation → 400, NotFound → 404), so a non-Approver
 * calling `approve` returns 403 with no extra handling here.
 */
import type { Core } from "@strapi/strapi";

type Ctx = {
  request: { body: Record<string, unknown> };
  state: { user?: unknown };
  badRequest: (msg: string) => unknown;
  body: unknown;
};

function service(strapi: Core.Strapi) {
  return strapi.plugin("editorial").service("transition");
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async transition(ctx: Ctx) {
    const { uid, documentId, locale, to, reason } = ctx.request.body ?? {};
    if (!uid || !documentId || !to) {
      return ctx.badRequest("`uid`, `documentId` and `to` are required.");
    }
    const result = await service(strapi).transition({
      uid,
      documentId,
      locale,
      to,
      reason,
      user: ctx.state.user,
    });
    ctx.body = { data: result };
  },

  /** Soft-delete → move to `archived` (sets trashedAt, unpublishes). */
  async trash(ctx: Ctx) {
    const { uid, documentId, locale, reason } = ctx.request.body ?? {};
    if (!uid || !documentId) return ctx.badRequest("`uid` and `documentId` are required.");
    const result = await service(strapi).transition({
      uid,
      documentId,
      locale,
      to: "archived",
      reason,
      user: ctx.state.user,
    });
    ctx.body = { data: result };
  },

  /** Restore from trash → back to `draft` (clears trashedAt). */
  async restore(ctx: Ctx) {
    const { uid, documentId, locale, reason } = ctx.request.body ?? {};
    if (!uid || !documentId) return ctx.badRequest("`uid` and `documentId` are required.");
    const result = await service(strapi).transition({
      uid,
      documentId,
      locale,
      to: "draft",
      reason,
      user: ctx.state.user,
    });
    ctx.body = { data: result };
  },
});
