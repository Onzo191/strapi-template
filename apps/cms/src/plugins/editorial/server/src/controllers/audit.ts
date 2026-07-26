/**
 * Audit controller — powers the admin audit viewer + export (§4.5 / Req §5).
 */
import type { Core } from "@strapi/strapi";

type Ctx = {
  query: Record<string, string | undefined>;
  set: (key: string, value: string) => void;
  body: unknown;
};

function service(strapi: Core.Strapi) {
  return strapi.plugin("editorial").service("audit");
}

function readFilters(query: Record<string, string | undefined>) {
  return {
    action: query.action,
    contentType: query.contentType,
    documentId: query.documentId,
    actorEmail: query.actorEmail,
    from: query.from,
    to: query.to,
  };
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async find(ctx: Ctx) {
    const result = await service(strapi).list({
      filters: readFilters(ctx.query),
      page: ctx.query.page ? Number(ctx.query.page) : 1,
      pageSize: ctx.query.pageSize ? Number(ctx.query.pageSize) : 50,
    });
    ctx.body = result;
  },

  async export(ctx: Ctx) {
    const format = ctx.query.format === "json" ? "json" : "csv";
    const { body, contentType, filename } = await service(strapi).exportEntries(
      readFilters(ctx.query),
      format,
    );
    ctx.set("Content-Type", contentType);
    ctx.set("Content-Disposition", `attachment; filename="${filename}"`);
    ctx.body = body;
  },
});
