/**
 * Tenant scope guard (L3 of docs/multi-tenancy-plan.md §2) — the layer that
 * actually stops cross-tenant access.
 *
 * ## Why this exists when the RBAC condition already filters
 *
 * The condition (`conditions.ts`) is what makes the content manager *show* the
 * right rows, and it only reaches queries that go through the admin permission
 * engine. This guard sits under the document service, so it also covers custom
 * controllers, plugin code and anything added later that forgets to ask. Two
 * concrete holes the condition alone leaves open:
 *
 *  - `GET /content-manager/collection-types/api::page.page/<documentId>` for a
 *    guessed id — the condition filters lists, this checks the single read.
 *  - A write that moves an entry to another tenant by sending `data.site`. Field
 *    level permissions are an Enterprise feature, so the only place to refuse
 *    that is here.
 *
 * ## Why a document-service middleware and not a Koa one
 *
 * Same reason as `src/middlewares/draft-guard.ts`: Strapi composes
 * `authenticate` *inside* each route, so a global Koa middleware sees no
 * `ctx.state.user` and could not tell one admin from another.
 */
import type { Core } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import { isTenantScopedUid, SITE_UID, SLUG_SOURCES } from "../constants";
import type { Actor } from "../services/scope";

const READ_ACTIONS = new Set(["findMany", "findFirst", "count"]);
const MUTATE_ACTIONS = new Set([
  "update",
  "delete",
  "publish",
  "unpublish",
  "discardDraft",
  "clone",
]);

type Params = Record<string, unknown> & {
  data?: Record<string, unknown>;
  filters?: unknown;
  documentId?: string;
  locale?: string;
};

/** `{ documentId }`, `{ id }`, a raw id, or a connect/set payload → documentId. */
function siteIdFromInput(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.documentId === "string") return obj.documentId;
    if (typeof obj.id === "string" || typeof obj.id === "number") return String(obj.id);
    // Relation input shapes: { set: [...] } / { connect: [...] }
    for (const key of ["set", "connect"]) {
      const list = obj[key];
      if (Array.isArray(list) && list.length > 0) return siteIdFromInput(list[0]);
    }
  }
  return null;
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function registerTenantScope(strapi: Core.Strapi): void {
  const scopeService = () => strapi.plugin("tenant").service("scope");

  /** The site a stored entry belongs to, read straight from the DB. */
  async function siteOfEntry(uid: string, documentId: string): Promise<string | null> {
    // `site` is not localized, so any row of the document carries the same value.
    const row = (await strapi.db.query(uid).findOne({
      where: { documentId },
      populate: { site: { select: ["documentId"] } },
    })) as { site?: { documentId?: string } | null } | null;
    return row?.site?.documentId ?? null;
  }

  /**
   * Refuse a slug that is already taken *on the same site*, and fill in an empty
   * one. Replaces the global uniqueness that the `uid` field type used to give
   * us and that multi-tenancy had to drop (constants.ts `SLUG_SOURCES`).
   */
  async function enforceSlug(
    uid: string,
    params: Params,
    siteDocumentId: string,
    documentId?: string,
  ): Promise<void> {
    const spec = SLUG_SOURCES[uid];
    const data = params.data;
    if (!spec || !data) return;

    const raw = data[spec.slugField];
    let slug: string;
    if (typeof raw === "string" && raw.trim() !== "") {
      slug = raw.trim();
    } else {
      const source = data[spec.sourceField];
      if (typeof source !== "string" || source.trim() === "") return; // let validation speak
      slug = slugify(source);
    }
    if (slug === "") return;
    data[spec.slugField] = slug;

    const where: Record<string, unknown> = {
      [spec.slugField]: slug,
      site: { documentId: siteDocumentId },
    };
    if (documentId) where.documentId = { $ne: documentId };
    if (params.locale) where.locale = params.locale;

    const clash = await strapi.db.query(uid).findOne({ where, select: ["id"] });
    if (clash) {
      throw new errors.ValidationError(
        `"${slug}" đã được dùng trên website này (${spec.slugField}). Chọn giá trị khác.`,
      );
    }
  }

  strapi.documents.use(async (context, next) => {
    const uid = context.uid as string;
    const isSite = uid === SITE_UID;
    if (!isTenantScopedUid(uid) && !isSite) return next();

    const params = (context.params ?? {}) as Params;
    const actor: Actor = await scopeService().current();

    // Trusted server code (seed, backfill, transition service) is unscoped:
    // it has no user to scope to and legitimately spans tenants. Content-API
    // delivery is not guarded here either — see scope.ts.
    if (actor.kind !== "admin") return next();

    // A super admin is unscoped, but "unscoped" must not mean "may create
    // orphans". An entry saved with no `site` is invisible to every other user
    // and un-editable in the content manager — precisely the broken state
    // `bootstrap/sites.ts` exists to repair. So the one rule that still applies
    // to them is: say which site this belongs to.
    if (actor.isSuperAdmin) {
      if (context.action === "create" && !isSite && !siteIdFromInput(params.data?.site)) {
        // Fall back to whichever site they picked in "My Sites"; only refuse when
        // there is genuinely nothing to infer from.
        if (!actor.activeSite) {
          throw new errors.ValidationError("Chọn website (site) cho nội dung này.");
        }
        params.data ??= {};
        params.data.site = { connect: [{ documentId: actor.activeSite.siteDocumentId }] };
        context.params = params as typeof context.params;
      }
      return next();
    }

    const scope = actor.siteScope;

    // Reads: narrow to the actor's sites. `$in: []` matches nothing, which is the
    // correct answer for a user with no assignment — not "everything".
    if (READ_ACTIONS.has(context.action)) {
      const siteFilter = isSite
        ? { documentId: { $in: scope } }
        : { site: { documentId: { $in: scope } } };
      params.filters = params.filters ? { $and: [params.filters, siteFilter] } : siteFilter;
      context.params = params as typeof context.params;
      return next();
    }

    // Single read by documentId: the filter above does not apply, so check the
    // result. This is the "guessed the URL" path.
    if (context.action === "findOne") {
      const result = await next();
      if (!result) return result;
      const entrySite = isSite
        ? (result as { documentId?: string }).documentId
        : await siteOfEntry(uid, (result as { documentId: string }).documentId);
      if (!entrySite || !scope.includes(entrySite)) {
        throw new errors.ForbiddenError("Nội dung này thuộc website bạn không được phân quyền.");
      }
      return result;
    }

    // Only a super admin creates or edits sites themselves.
    if (isSite) {
      throw new errors.ForbiddenError("Chỉ Super Admin mới được tạo/sửa website.");
    }

    if (context.action === "create") {
      params.data ??= {};
      const data = params.data;
      const requested = siteIdFromInput(data.site);

      if (requested) {
        if (!scope.includes(requested)) {
          throw new errors.ForbiddenError("Bạn không được tạo nội dung cho website này.");
        }
      } else {
        // Never guess. A user with several sites and no active one gets told to
        // choose, rather than having their draft filed under the wrong brand.
        if (!actor.activeSite) {
          throw new errors.ValidationError(
            scope.length === 0
              ? "Tài khoản của bạn chưa được phân quyền website nào."
              : "Chọn website đang làm việc trước khi tạo nội dung.",
          );
        }
        data.site = { connect: [{ documentId: actor.activeSite.siteDocumentId }] };
      }

      await enforceSlug(uid, params, requested ?? actor.activeSite?.siteDocumentId ?? "");
      context.params = params as typeof context.params;
      return next();
    }

    if (MUTATE_ACTIONS.has(context.action)) {
      const documentId = params.documentId;
      if (!documentId) return next();

      const entrySite = await siteOfEntry(uid, documentId);
      if (!entrySite || !scope.includes(entrySite)) {
        throw new errors.ForbiddenError("Nội dung này thuộc website bạn không được phân quyền.");
      }

      // Moving an entry between tenants is a super-admin act. Field-level
      // permissions would express this declaratively, but they are Enterprise —
      // so it is refused here or nowhere.
      const requested = siteIdFromInput(params.data?.site);
      if (requested && requested !== entrySite) {
        throw new errors.ForbiddenError("Không thể chuyển nội dung sang website khác.");
      }

      await enforceSlug(uid, params, entrySite, documentId);
      context.params = params as typeof context.params;
      return next();
    }

    return next();
  });

  strapi.log.info("[tenant] scope guard wired (document-service middleware)");
}
