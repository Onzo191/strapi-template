/**
 * Audit controller — powers the admin audit viewer + export (§4.5 / Req §5).
 *
 * P7: both actions are role-gated. `type: "admin"` routes only prove the caller
 * is *some* authenticated admin user; without an explicit check a Contributor or
 * Viewer could read (and bulk-export) every rejection comment and the titles of
 * unpublished work across the whole newsroom. `auditRead`/`auditExport` in the
 * RBAC matrix draw that line.
 */
import type { Core } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import { roleCanPerform } from "../constants/rbac";

type Ctx = {
  query: Record<string, string | undefined>;
  state: { user?: { roles?: Array<{ code: string }> } };
  set: (key: string, value: string) => void;
  body: unknown;
};

function service(strapi: Core.Strapi) {
  return strapi.plugin("editorial").service("audit");
}

/** Throw 403 unless the acting admin user holds a role permitting `action`. */
function assertCan(ctx: Ctx, action: string): void {
  const roleCodes = (ctx.state.user?.roles ?? []).map((role) => role.code);
  if (!roleCanPerform(roleCodes, action)) {
    throw new errors.ForbiddenError(`Your role is not permitted to ${action}.`);
  }
}

/**
 * Whitelist the filter keys we accept and cap their length. The values reach
 * `strapi.db.query(...).findMany({ where })`, which parameterises them — so this
 * is not SQL-injection defence, it is defence against a caller passing a huge
 * string (or, if a future refactor swapped in a raw query, something worse).
 */
const MAX_FILTER_LENGTH = 200;

function readFilters(query: Record<string, string | undefined>) {
  const clamp = (value: string | undefined) =>
    typeof value === "string" && value.length > 0 ? value.slice(0, MAX_FILTER_LENGTH) : undefined;

  return {
    action: clamp(query.action),
    contentType: clamp(query.contentType),
    entryDocumentId: clamp(query.entryDocumentId ?? query.documentId),
    actorEmail: clamp(query.actorEmail),
    from: clamp(query.from),
    to: clamp(query.to),
  };
}

/** Coerce a pagination param, ignoring anything non-numeric. */
function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async find(ctx: Ctx) {
    assertCan(ctx, "auditRead");
    const result = await service(strapi).list({
      filters: readFilters(ctx.query),
      page: toPositiveInt(ctx.query.page, 1),
      pageSize: toPositiveInt(ctx.query.pageSize, 50),
    });
    ctx.body = result;
  },

  async export(ctx: Ctx) {
    assertCan(ctx, "auditExport");
    const format = ctx.query.format === "json" ? "json" : "csv";
    const { body, contentType, filename } = await service(strapi).exportEntries(
      readFilters(ctx.query),
      format,
    );
    ctx.set("Content-Type", contentType);
    ctx.set("Content-Disposition", `attachment; filename="${filename}"`);
    // Never let a proxy or the browser cache a bulk audit export.
    ctx.set("Cache-Control", "no-store");
    ctx.body = body;

    strapi.log.info(
      `[audit] export (${format}) by ${String(
        (ctx.state.user as { email?: string } | undefined)?.email ?? "unknown",
      ).replace(/[\r\n]+/g, " ")}`,
    );
  },
});
