/**
 * SSO enforcement (Req §8 — "SSO/MFA for the CMS admin").
 *
 * With `OIDC_ENFORCE=true`, a browser loading the admin panel without a session
 * is redirected straight into the IdP flow, so the local email/password form is
 * never the way in. Enforcement — not just "an SSO button is available" — is what
 * makes the IdP's MFA and conditional-access policies actually apply to CMS
 * access, and it is what lets the local password path be treated as break-glass.
 *
 * ## Why intercept the HTML load, not the login route
 *
 * The admin is a single-page app: everything under `/admin/*` is served the same
 * `index.html`, and the SPA then routes `/admin/auth/login` **client-side** with
 * no request to the server. Intercepting `GET /admin/auth/login` therefore never
 * fires on a normal first visit. The reliable choke point is the initial HTML
 * document request for anything under `/admin`.
 *
 * ## How "has a session" is detected
 *
 * By the presence of the `strapi_admin_refresh` cookie. Strapi's login controller
 * sets it on *every* successful login — both the "remember me" and the
 * session-only branch — so it is the one signal that is always there. The access
 * token is not usable for this: in persist mode it lives in `localStorage`, which
 * the server cannot see, so keying on it would bounce logged-in users to the IdP
 * on every page load.
 *
 * The cookie is not *validated* here — that would mean verifying a refresh token
 * on every static HTML hit. It doesn't need to be: this middleware only decides
 * "send them to the IdP or let the SPA load". A forged or expired cookie gets the
 * SPA, which then fails its `/admin/access-token` call and redirects to login
 * itself. Nothing is authorised on the strength of this check.
 *
 * ## Break-glass
 *
 * `?sso=off` (or `OIDC_ENFORCE=false`) reaches the local login form — needed when
 * the IdP is down, and needed on day one to create the first admin user. It is
 * logged at `warn` every time so its use is visible in the audit trail, and it
 * bypasses only the *redirect*: the local form still requires a real password,
 * and `config/admin.ts` session limits still apply.
 */
import type { Core } from "@strapi/strapi";
import { oidcConfigFromEnv } from "./oidc";

const REFRESH_COOKIE_NAME = "strapi_admin_refresh";

/** Paths under /admin that must stay reachable without a session. */
const ALWAYS_ALLOWED = [
  // The SPA bundle and its assets — blocking these would break the panel itself.
  "/admin/",
  // Password reset arrives by email link and is a legitimate local-auth path.
  "/admin/auth/reset-password",
  // First-run admin creation, before any IdP mapping can exist.
  "/admin/auth/register-admin",
];

/**
 * Structural subset of the Koa context we touch. `query` is typed `unknown`-valued
 * to stay assignable from Koa's own `ParameterizedContext` (whose query values are
 * `unknown`), which is what lets this be handed straight to `strapi.server.use`.
 */
interface Ctx {
  request: {
    path: string;
    method: string;
    query: Record<string, unknown>;
    header: Record<string, string | string[] | undefined>;
    ip: string;
  };
  cookies: { get: (name: string) => string | undefined };
  redirect: (url: string) => void;
}

/** Only an actual page load, not an asset fetch or an XHR. */
function isHtmlNavigation(ctx: Ctx): boolean {
  if (ctx.request.method !== "GET") return false;

  const accept = ctx.request.header.accept;
  const acceptsHtml =
    typeof accept === "string" && accept.includes("text/html") && !accept.startsWith("*/*");
  if (!acceptsHtml) return false;

  // `Sec-Fetch-Dest: document` is the precise signal in modern browsers; fall
  // back to the Accept header for anything that doesn't send it.
  const dest = ctx.request.header["sec-fetch-dest"];
  if (typeof dest === "string" && dest !== "document") return false;

  // Never intercept a request for a built asset that happens to accept HTML.
  return !/\.[a-z0-9]{2,5}$/i.test(ctx.request.path);
}

export function createSsoEnforcement(strapi: Core.Strapi) {
  return async (ctx: Ctx, next: () => Promise<unknown>) => {
    if (process.env.OIDC_ENFORCE !== "true") return next();
    if (!oidcConfigFromEnv()) return next();

    const path = ctx.request.path;
    // `/admin` exactly, or anything beneath it.
    if (path !== "/admin" && !path.startsWith("/admin/")) return next();

    if (ALWAYS_ALLOWED.some((allowed) => allowed !== "/admin/" && path.startsWith(allowed))) {
      return next();
    }
    if (!isHtmlNavigation(ctx)) return next();
    if (ctx.cookies.get(REFRESH_COOKIE_NAME)) return next();

    if (ctx.request.query.sso === "off") {
      strapi.log.warn(
        `[sso] BREAK-GLASS: local admin login reached with ?sso=off from ${String(ctx.request.ip)
          .replace(/[\r\n]+/g, " ")
          .slice(0, 64)}`,
      );
      return next();
    }

    ctx.redirect("/api/sso/login");
    return undefined;
  };
}
