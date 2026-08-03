/**
 * Assignment service — who may work on which site, and which site they are
 * currently working on.
 *
 * Every read and write goes through `strapi.db.query`, never the document
 * service. Two reasons, both load-bearing:
 *
 *  1. The document service re-enters the tenant-scope middleware, and this table
 *     is the thing that middleware asks about — a lookup loop waiting to happen.
 *  2. It would fire the revalidation webhook and the editorial auto-audit for a
 *     permission change, which is not a content event.
 *
 * The same reasoning `editorial/services/audit.ts` gives for its own table.
 */
import type { Core } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import { ASSIGNMENT_UID, SITE_UID } from "../constants";

export interface AssignmentRow {
  id: number;
  adminUserId: number;
  siteKey: string;
  siteDocumentId: string;
  isActiveSite: boolean;
}

export interface SiteRow {
  id: number;
  documentId: string;
  key: string;
  name: string;
  isActive: boolean;
}

/**
 * Per-request memo of a user's scope.
 *
 * The RBAC condition runs on **every** ability generation — that is at least once
 * per admin request, and the content manager issues several per screen. Without
 * this, one page load turns into a handful of identical assignment queries.
 *
 * Keyed on the Koa context object itself via a WeakMap, so entries disappear with
 * the request and a long-lived process cannot accumulate them. Deliberately NOT a
 * time-based cache: a super admin revoking a site must take effect on the very
 * next request, not up to a TTL later.
 */
const requestScopeMemo = new WeakMap<object, Map<number, AssignmentRow[]>>();

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const db = () => strapi.db.query(ASSIGNMENT_UID);

  async function rowsFor(adminUserId: number): Promise<AssignmentRow[]> {
    const ctx = strapi.requestContext.get() as object | undefined;
    if (!ctx) {
      return (await db().findMany({ where: { adminUserId } })) as AssignmentRow[];
    }

    let perUser = requestScopeMemo.get(ctx);
    if (!perUser) {
      perUser = new Map();
      requestScopeMemo.set(ctx, perUser);
    }
    const hit = perUser.get(adminUserId);
    if (hit) return hit;

    const rows = (await db().findMany({ where: { adminUserId } })) as AssignmentRow[];
    perUser.set(adminUserId, rows);
    return rows;
  }

  /** Drop the memo for a user after a write, so the same request sees the change. */
  function invalidate(adminUserId: number): void {
    const ctx = strapi.requestContext.get() as object | undefined;
    if (ctx) requestScopeMemo.get(ctx)?.delete(adminUserId);
  }

  return {
    /** Raw assignment rows for a user. */
    rowsFor,

    /**
     * The site `documentId`s a user may see.
     *
     * An empty array is a meaningful answer, not a missing one: it means "no
     * sites", and callers turn it into `$in: []`, which matches nothing. A user
     * with no assignment sees an empty CMS — never the whole CMS.
     */
    async visibleSiteDocumentIds(adminUserId: number): Promise<string[]> {
      const rows = await rowsFor(adminUserId);
      return rows.map((row) => row.siteDocumentId);
    },

    /**
     * The site new content is filed under. `null` when the user has several sites
     * and has not picked one — callers must refuse to guess (see the guard's
     * `create` branch).
     */
    async activeSiteFor(adminUserId: number): Promise<AssignmentRow | null> {
      const rows = await rowsFor(adminUserId);
      if (rows.length === 0) return null;
      return rows.find((row) => row.isActiveSite) ?? (rows.length === 1 ? rows[0] : null);
    },

    /**
     * Set the user's working site.
     *
     * The membership check is the whole point: this is the only endpoint through
     * which a user influences their own scope, so it is the primary attack
     * surface of the feature.
     *
     * `allowAny` is for super admins only, and it is a *working preference*, not
     * a grant — they already reach every tenant. Without it they would be the one
     * role unable to say which site their next article belongs to.
     */
    async setActiveSite(
      adminUserId: number,
      siteDocumentId: string,
      { allowAny = false }: { allowAny?: boolean } = {},
    ): Promise<AssignmentRow> {
      const rows = await rowsFor(adminUserId);
      let target = rows.find((row) => row.siteDocumentId === siteDocumentId);

      if (!target) {
        if (!allowAny) {
          throw new errors.ForbiddenError("Bạn không được phân quyền trên website này.");
        }
        const site = (await strapi.db
          .query(SITE_UID)
          .findOne({ where: { documentId: siteDocumentId } })) as SiteRow | null;
        if (!site) throw new errors.NotFoundError("Website không tồn tại.");

        target = (await db().create({
          data: {
            adminUserId,
            siteKey: site.key,
            siteDocumentId: site.documentId,
            isActiveSite: false,
          },
        })) as AssignmentRow;
      }

      await db().updateMany({
        where: { adminUserId, isActiveSite: true },
        data: { isActiveSite: false },
      });
      await db().update({ where: { id: target.id }, data: { isActiveSite: true } });
      invalidate(adminUserId);

      return { ...target, isActiveSite: true };
    },

    /**
     * Replace a user's assignments with exactly `siteDocumentIds`.
     *
     * Returns what changed so the caller can audit it — "who was granted access to
     * which site" is the compliance-relevant fact, and it is invisible if we only
     * record the end state.
     */
    async replaceAssignments(
      adminUserId: number,
      siteDocumentIds: string[],
    ): Promise<{ granted: SiteRow[]; revoked: AssignmentRow[] }> {
      const wanted = [...new Set(siteDocumentIds)];

      const sites = (
        wanted.length > 0
          ? await strapi.db.query(SITE_UID).findMany({ where: { documentId: { $in: wanted } } })
          : []
      ) as SiteRow[];

      const unknown = wanted.filter((id) => !sites.some((site) => site.documentId === id));
      if (unknown.length > 0) {
        throw new errors.ValidationError(`Website không tồn tại: ${unknown.join(", ")}`);
      }

      const current = await rowsFor(adminUserId);
      const currentIds = new Set(current.map((row) => row.siteDocumentId));

      const revoked = current.filter((row) => !wanted.includes(row.siteDocumentId));
      const granted = sites.filter((site) => !currentIds.has(site.documentId));

      if (revoked.length > 0) {
        await db().deleteMany({ where: { id: { $in: revoked.map((row) => row.id) } } });
      }
      for (const site of granted) {
        await db().create({
          data: {
            adminUserId,
            siteKey: site.key,
            siteDocumentId: site.documentId,
            isActiveSite: false,
          },
        });
      }

      invalidate(adminUserId);
      await this.reconcileActiveSite(adminUserId);

      return { granted, revoked };
    },

    /**
     * Keep the active-site flag honest after a membership change.
     *
     * Skipping this is the subtle failure: the active site is what the guard uses
     * to stamp `site` on newly created entries, so a user whose active site was
     * revoked would keep filing content into a tenant they no longer belong to —
     * and the guard's create branch would accept it, because the value came from
     * us rather than from the request.
     */
    async reconcileActiveSite(adminUserId: number): Promise<void> {
      const rows = await rowsFor(adminUserId);
      const active = rows.filter((row) => row.isActiveSite);

      if (rows.length === 0) return;
      if (active.length === 1) return;

      if (active.length > 1) {
        // Should not happen; repair rather than trust it.
        await db().updateMany({
          where: { id: { $in: active.slice(1).map((row) => row.id) } },
          data: { isActiveSite: false },
        });
        invalidate(adminUserId);
        return;
      }

      // No active site. One site ⇒ pick it. Several ⇒ leave unset and let the
      // user choose; guessing would file their next article under the wrong brand.
      if (rows.length === 1) {
        await db().update({ where: { id: rows[0].id }, data: { isActiveSite: true } });
        invalidate(adminUserId);
      }
    },

    /** Remove every assignment of a deleted admin user. */
    async removeUser(adminUserId: number): Promise<void> {
      await db().deleteMany({ where: { adminUserId } });
      invalidate(adminUserId);
    },
  };
};
