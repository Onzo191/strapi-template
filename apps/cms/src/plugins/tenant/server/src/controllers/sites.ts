/**
 * Site CRUD for the super-admin console. Every route behind this controller is
 * gated by the `is-super-admin` policy (routes/index.ts).
 *
 * Writes go through `strapi.documents` so the site gets a proper `documentId`
 * (UUIDv7, see src/bootstrap/document-ids.ts) — assignments key off it.
 */
import type { Core } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import { ASSIGNMENT_UID, SITE_UID, TENANT_SCOPED_UIDS } from "../constants";

interface Ctx {
  request: { body: Record<string, unknown> };
  params: Record<string, string>;
  body: unknown;
}

/** Whitelist of writable fields — never spread a request body into a model. */
function pickSiteInput(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ["name", "key", "domains", "defaultLocale", "locales", "theme", "isActive"]) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /** Sites plus how many people can work on each — the console's main table. */
  async find(ctx: Ctx) {
    const sites = (await strapi.documents(SITE_UID).findMany({
      sort: "name:asc",
      // biome-ignore lint/suspicious/noExplicitAny: document-service params are loosely typed here
    } as any)) as Array<Record<string, unknown>>;

    const counts = new Map<string, number>();
    for (const site of sites) {
      const documentId = site.documentId as string;
      counts.set(
        documentId,
        await strapi.db.query(ASSIGNMENT_UID).count({ where: { siteDocumentId: documentId } }),
      );
    }

    ctx.body = {
      data: sites.map((site) => ({
        ...site,
        userCount: counts.get(site.documentId as string) ?? 0,
      })),
    };
  },

  async create(ctx: Ctx) {
    const data = pickSiteInput(ctx.request.body ?? {});
    if (typeof data.name !== "string" || data.name.trim() === "") {
      throw new errors.ValidationError("Tên website là bắt buộc.");
    }

    const created = await strapi.documents(SITE_UID).create({
      // biome-ignore lint/suspicious/noExplicitAny: generated Input types are excluded from this tsconfig
      data: data as any,
    });
    strapi.log.info(`[tenant] site created: ${(created as { key?: string }).key}`);
    ctx.body = { data: created };
  },

  async update(ctx: Ctx) {
    const documentId = ctx.params.id;
    const data = pickSiteInput(ctx.request.body ?? {});

    const updated = await strapi.documents(SITE_UID).update({
      documentId,
      // biome-ignore lint/suspicious/noExplicitAny: generated Input types are excluded from this tsconfig
      data: data as any,
    });
    if (!updated) throw new errors.NotFoundError("Website không tồn tại.");

    // Assignments cache the site key for display; keep them consistent.
    if (typeof data.key === "string") {
      await strapi.db
        .query(ASSIGNMENT_UID)
        .updateMany({ where: { siteDocumentId: documentId }, data: { siteKey: data.key } });
    }

    ctx.body = { data: updated };
  },

  /**
   * Deleting a site is refused while content still points at it.
   *
   * Strapi would happily delete the row and leave the entries with a dangling
   * relation — which is exactly the "site-less content" state that
   * `bootstrap/sites.ts` exists to repair, and those entries would become
   * invisible to every non-super-admin in the meantime.
   */
  async remove(ctx: Ctx) {
    const documentId = ctx.params.id;

    const assignments = await strapi.db
      .query(ASSIGNMENT_UID)
      .count({ where: { siteDocumentId: documentId } });
    if (assignments > 0) {
      throw new errors.ValidationError(
        `Còn ${assignments} người dùng được phân quyền website này — gỡ phân quyền trước.`,
      );
    }

    for (const uid of TENANT_SCOPED_UIDS) {
      if (!strapi.contentType(uid as never)) continue;
      const used = await strapi.db.query(uid).count({ where: { site: { documentId } } });
      if (used > 0) {
        throw new errors.ValidationError(
          `Website còn ${used} bản ghi ${uid} — chuyển hoặc xoá nội dung trước.`,
        );
      }
    }

    await strapi.documents(SITE_UID).delete({ documentId });
    ctx.body = { data: { documentId } };
  },
});
