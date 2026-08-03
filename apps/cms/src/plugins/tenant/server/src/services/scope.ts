/**
 * Actor resolution — turns "the current request" into "which sites may it touch".
 *
 * Both the RBAC condition and the document-service guard need the same answer,
 * and getting it from two places is how the two layers would drift apart.
 */
import type { Core } from "@strapi/strapi";
import { SUPER_ADMIN_CODE } from "../../../../editorial/server/src/constants/rbac";
import type { AssignmentRow } from "./assignment";

/** Structural subset of the Koa context this service reads. */
interface KoaLike {
  request?: { path?: string };
  state?: {
    user?: { id?: number; email?: string; roles?: Array<{ code?: string }> };
    auth?: { strategy?: { name?: string } };
  };
}

export type ActorKind = "admin" | "content-api" | "trusted";

export interface Actor {
  kind: ActorKind;
  userId: number | null;
  email: string | null;
  /** Super admins are never scoped — they administer the tenants. */
  isSuperAdmin: boolean;
  /** Site `documentId`s this actor may read/write. Empty ⇒ nothing. */
  siteScope: string[];
  activeSite: AssignmentRow | null;
}

/** Trusted server-side call: seeding, migrations, lifecycle hooks, the CLI. */
const TRUSTED: Actor = {
  kind: "trusted",
  userId: null,
  email: null,
  isSuperAdmin: true,
  siteScope: [],
  activeSite: null,
};

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Resolve the actor behind the current request, or `null` when there is no
   * request at all.
   *
   * A missing request context means trusted server code — the same rule
   * `draft-guard.ts` applies, and for the same reason: bootstrap seeding and the
   * editorial transition service legitimately operate across the whole database,
   * and they have no user to scope to.
   */
  async current(): Promise<Actor> {
    const ctx = strapi.requestContext.get() as KoaLike | undefined;
    if (!ctx) return TRUSTED;

    const user = ctx.state?.user;
    if (!user?.id) {
      // No admin user: either an API-token content-api call or an anonymous one.
      //
      // Content API scoping (delivery by domain, per-site tokens) is the web
      // phase — docs/multi-tenancy-plan.md §5.4. Until then the delivery layer
      // still serves a single site and is left alone rather than half-guarded:
      // a filter applied here without the web app passing a site would simply
      // return nothing and take the whole site down.
      return {
        kind: "content-api",
        userId: null,
        email: null,
        isSuperAdmin: false,
        siteScope: [],
        activeSite: null,
      };
    }

    const isSuperAdmin = (user.roles ?? []).some((role) => role?.code === SUPER_ADMIN_CODE);
    const assignment = strapi.plugin("tenant").service("assignment");

    return {
      kind: "admin",
      userId: user.id,
      email: user.email ?? null,
      isSuperAdmin,
      siteScope: isSuperAdmin ? [] : await assignment.visibleSiteDocumentIds(user.id),
      activeSite: await assignment.activeSiteFor(user.id),
    };
  },
});
