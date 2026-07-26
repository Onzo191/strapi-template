/** Workflow controller — board data for the admin workflow page (§4.5). */
import type { Core } from "@strapi/strapi";

type Ctx = {
  query: Record<string, string | undefined>;
  badRequest: (msg: string) => unknown;
  body: unknown;
};

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async board(ctx: Ctx) {
    const uid = ctx.query.uid;
    if (!uid) return ctx.badRequest("`uid` query param is required.");
    const items = await strapi
      .plugin("editorial")
      .service("workflow")
      .board({ uid, locale: ctx.query.locale });
    ctx.body = { data: items };
  },
});
