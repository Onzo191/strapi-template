/**
 * Draft-content guard for the public Content API (P7 §9 — the highest-severity
 * finding of the launch security review).
 *
 * ## The problem
 *
 * Strapi 5's core service defaults reads to published content:
 *
 *   getFetchParams(params) { return { status: 'published', ...params } }
 *
 * …but `status` is on `ALLOWED_QUERY_PARAM_KEYS`, so a *client-supplied* `status`
 * lands in `params` and **overrides that default**. There is no separate
 * "read drafts" permission in the Content API: any caller who can `find` can
 * also `find?status=draft`.
 *
 * For this site that means `GET /api/articles?status=draft` returns unpublished
 * content to anyone on the internet — embargoed press releases, financial
 * results before disclosure, half-written pages with the wrong numbers in them.
 * Exactly the material a corporate newsroom must not leak early, and exactly
 * what §4.5's Draft→Review→Approved workflow exists to stage.
 *
 * `publicationFilter` / `hasPublishedVersion` are blocked for the same reason at
 * one remove: they are draft-vs-published cohort selectors, so they answer
 * "which documents exist but have never been published?" — a disclosure oracle
 * even when the rows returned are published-only.
 *
 * ## Why a document-service middleware and not a Koa one
 *
 * Koa middlewares registered in `config/middlewares.ts` run *before* the router,
 * and Strapi composes authentication **inside** each route
 * (`createEndpointComposer`: `authenticate → authorize → policies → route
 * middlewares → action`). A global Koa middleware therefore sees
 * `ctx.state.auth` as `undefined` and could not tell the preview token from an
 * anonymous request. A per-route middleware would see auth, but would have to be
 * wired onto every route of every content type — and silently miss the next one
 * somebody adds.
 *
 * A document-service middleware runs after authentication, sees the resolved
 * `params.status`, and covers **every** content type and every custom controller
 * automatically. `strapi.requestContext.get()` (AsyncLocalStorage) recovers the
 * Koa context, so we can still distinguish the caller.
 *
 * Calls with *no* request context — bootstrap seeding, the editorial transition
 * service, lifecycle hooks — are always allowed: they are trusted server code,
 * and the transition service legitimately reads drafts.
 *
 * ## The rule
 *
 * Draft reads require an API token of type **full-access**. That is precisely
 * the shape of `STRAPI_PREVIEW_TOKEN` (§6.3 preview), and precisely *not* the
 * shape of the read-only token the web app uses for normal rendering — which is
 * what the `@vng/shared` fetcher already assumes when it says "the public token
 * must NOT be able to read unpublished content".
 *
 * An explicit draft request without that token is a **403**, not a silent
 * downgrade to published: a silent downgrade would hide both an attack and a
 * misconfigured preview token behind pages that merely look stale.
 */
import type { Core } from "@strapi/strapi";
import { errors } from "@strapi/utils";

/** Query/params keys that can widen a read beyond published content. */
const DRAFT_SELECTORS = ["publicationFilter", "hasPublishedVersion"] as const;

/** Document-service actions that read content (writes are RBAC-gated already). */
const READ_ACTIONS = new Set(["findOne", "findMany", "findFirst", "count"]);

interface KoaLike {
  request?: { path?: string; method?: string; ip?: string };
  state?: {
    auth?: {
      strategy?: { name?: string };
      credentials?: { type?: string; name?: string };
    };
  };
}

/**
 * Only a full-access API token may read drafts. Notably *not* satisfied by a
 * read-only token or a users-permissions user. The admin panel is unaffected
 * because it calls `/content-manager/*`, which this guard doesn't police.
 */
function mayReadDrafts(ctx: KoaLike): boolean {
  const auth = ctx.state?.auth;
  if (auth?.strategy?.name !== "content-api-token") return false;
  return auth.credentials?.type === "full-access";
}

function wantsNonPublished(params: Record<string, unknown> | undefined): boolean {
  if (!params) return false;
  const status = params.status;
  if (status !== undefined && status !== "published") return true;
  return DRAFT_SELECTORS.some((key) => params[key] !== undefined);
}

/**
 * Register the guard. Called once from `register()` — before `bootstrap()`, so it
 * is in place for the very first request the server accepts.
 */
export function registerDraftGuard(strapi: Core.Strapi): void {
  strapi.documents.use(async (context, next) => {
    if (!READ_ACTIONS.has(context.action)) return next();

    const params = context.params as Record<string, unknown> | undefined;
    if (!wantsNonPublished(params)) return next();

    // No HTTP context ⇒ trusted server-side call (seed, transition service,
    // lifecycle). Those are allowed to see drafts.
    const ctx = strapi.requestContext.get() as KoaLike | undefined;
    const path = ctx?.request?.path;
    if (!path?.startsWith("/api/")) return next();

    if (mayReadDrafts(ctx as KoaLike)) return next();

    strapi.log.warn(
      `[draft-guard] denied draft read: ${ctx?.request?.method ?? "?"} ${path} ` +
        `uid=${context.uid} ip=${ctx?.request?.ip ?? "?"}`,
    );
    throw new errors.ForbiddenError("Reading draft content requires a full-access API token.");
  });

  strapi.log.info("[draft-guard] active — Content API draft reads require a full-access token");
}
