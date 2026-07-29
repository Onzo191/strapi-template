/**
 * Admin SSO endpoints (Req §8 — SSO/MFA via the VNG IdP).
 *
 *   GET /sso/login     → redirect to the IdP's authorize endpoint
 *   GET /sso/callback  → verify, provision, mint an admin session, land in /admin
 *   GET /sso/status    → whether SSO is configured/enforced (used by the UI)
 *
 * The three one-time values of the flow (`state`, `nonce`, PKCE `code_verifier`)
 * are held in **short-lived httpOnly cookies** rather than server memory. With
 * ≥2 Strapi tasks behind an ALB (§A2), server-memory state breaks the moment the
 * callback lands on a different task than the login — a failure that only appears
 * under load, i.e. in production. Cookies follow the browser, so the flow is
 * stateless across instances.
 *
 * Those cookies are `SameSite=Lax`, which is required rather than incidental: the
 * callback arrives as a cross-site top-level GET redirect from the IdP, and
 * `Strict` would withhold them exactly then.
 */
import type { Core } from "@strapi/strapi";
import {
  buildAuthRequest,
  constantTimeEqual,
  exchangeCode,
  oidcConfigFromEnv,
  verifyIdToken,
} from "../oidc";
import { resolveAdminUser, SsoProvisionError } from "../provision";
import { mintAdminSession } from "../session";

const STATE_COOKIE = "vng_sso_state";
const NONCE_COOKIE = "vng_sso_nonce";
const VERIFIER_COOKIE = "vng_sso_verifier";

/** The auth round-trip should take seconds; 10 minutes is generous for MFA. */
const FLOW_TTL_MS = 10 * 60 * 1000;

type Ctx = {
  request: { secure: boolean; headers: Record<string, string | string[] | undefined>; ip: string };
  query: Record<string, string | string[] | undefined>;
  cookies: {
    get: (name: string) => string | undefined;
    set: (name: string, value: string | null, options?: Record<string, unknown>) => void;
  };
  redirect: (url: string) => void;
  status: number;
  body: unknown;
  set: (key: string, value: string) => void;
};

function flowCookieOptions(strapi: Core.Strapi, secureRequest: boolean) {
  const configured = strapi.config.get("admin.auth.cookie.secure") as boolean | undefined;
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    // Lax, not Strict — see the module doc.
    sameSite: "lax" as const,
    secure: typeof configured === "boolean" ? configured : isProduction && secureRequest,
    // Scoped to the SSO endpoints, so these never ride along on other requests.
    path: "/api/sso",
    overwrite: true,
    maxAge: FLOW_TTL_MS,
  };
}

function clearFlowCookies(strapi: Core.Strapi, ctx: Ctx) {
  const options = { ...flowCookieOptions(strapi, ctx.request.secure), maxAge: 0 };
  for (const name of [STATE_COOKIE, NONCE_COOKIE, VERIFIER_COOKIE]) {
    ctx.cookies.set(name, null, options);
  }
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Strip CR/LF so IdP-supplied text can't forge log lines. */
const logSafe = (value: unknown): string =>
  String(value ?? "-")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 300);

/**
 * Send the person to a message the admin panel can render. The reason is
 * URL-encoded into a query param on the login page; it never contains anything
 * from the IdP verbatim beyond our own classified message, so it cannot be used
 * to inject markup into that page.
 */
function failLogin(ctx: Ctx, reason: string): void {
  const target = new URL("/admin/auth/login", "http://placeholder");
  target.searchParams.set("ssoError", reason);
  ctx.redirect(`${target.pathname}?${target.searchParams.toString()}`);
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /** Is SSO usable? Consumed by the admin UI and by the enforcement middleware. */
  async status(ctx: Ctx) {
    const config = oidcConfigFromEnv();
    ctx.body = {
      configured: Boolean(config),
      enforced: process.env.OIDC_ENFORCE === "true" && Boolean(config),
      requireMfa: config?.requireMfa ?? null,
      autoProvision: config?.autoProvision ?? null,
    };
  },

  async login(ctx: Ctx) {
    const config = oidcConfigFromEnv();
    if (!config) {
      ctx.status = 501;
      ctx.body = { error: "SSO is not configured on this instance." };
      return;
    }

    let auth: Awaited<ReturnType<typeof buildAuthRequest>>;
    try {
      auth = await buildAuthRequest(config);
    } catch (err) {
      strapi.log.error(`[sso] could not reach the IdP: ${(err as Error).message}`);
      failLogin(ctx, "idp_unreachable");
      return;
    }

    const options = flowCookieOptions(strapi, ctx.request.secure);
    ctx.cookies.set(STATE_COOKIE, auth.state, options);
    ctx.cookies.set(NONCE_COOKIE, auth.nonce, options);
    ctx.cookies.set(VERIFIER_COOKIE, auth.codeVerifier, options);

    ctx.redirect(auth.url);
  },

  async callback(ctx: Ctx) {
    const config = oidcConfigFromEnv();
    if (!config) {
      ctx.status = 501;
      ctx.body = { error: "SSO is not configured on this instance." };
      return;
    }

    const state = first(ctx.query.state);
    const code = first(ctx.query.code);
    const idpError = first(ctx.query.error);

    const expectedState = ctx.cookies.get(STATE_COOKIE);
    const expectedNonce = ctx.cookies.get(NONCE_COOKIE);
    const codeVerifier = ctx.cookies.get(VERIFIER_COOKIE);

    // Whatever happens next, this flow's one-time values are spent.
    clearFlowCookies(strapi, ctx);

    if (idpError) {
      // e.g. `access_denied` when the user cancels, or `interaction_required`.
      strapi.log.warn(`[sso] IdP returned an error: ${logSafe(idpError)}`);
      failLogin(ctx, "idp_error");
      return;
    }

    // `state` first: it proves the callback belongs to a flow *this browser*
    // started, which is what stops an attacker feeding us their own code.
    if (!state || !expectedState || !constantTimeEqual(state, expectedState)) {
      strapi.log.warn(`[sso] state mismatch from ${logSafe(ctx.request.ip)}`);
      failLogin(ctx, "state_mismatch");
      return;
    }
    if (!code || !codeVerifier || !expectedNonce) {
      failLogin(ctx, "incomplete_flow");
      return;
    }

    let claims: Awaited<ReturnType<typeof verifyIdToken>>;
    try {
      const tokens = await exchangeCode(config, code, codeVerifier);
      if (!tokens.id_token) throw new Error("token response contained no id_token");
      claims = await verifyIdToken(config, tokens.id_token, expectedNonce);
    } catch (err) {
      // Includes the MFA-assurance failure, which is a legitimate denial rather
      // than a bug — logged at warn with the reason so it is diagnosable.
      strapi.log.warn(`[sso] token verification failed: ${logSafe((err as Error).message)}`);
      failLogin(ctx, "token_invalid");
      return;
    }

    try {
      const user = await resolveAdminUser(strapi, claims, config);
      await mintAdminSession(strapi, ctx, user.id);

      strapi.log.info(
        `[sso] login ok for ${logSafe(user.email)} ` +
          `(acr=${logSafe(claims.acr)} amr=${logSafe((claims.amr ?? []).join("+"))})`,
      );

      // Land in the panel. The SPA reads the access cookie set by
      // `mintAdminSession` on its cold load, so no handoff page is needed.
      ctx.redirect("/admin");
    } catch (err) {
      if (err instanceof SsoProvisionError) {
        strapi.log.warn(`[sso] access denied: ${logSafe(err.message)}`);
        failLogin(ctx, "not_authorized");
        return;
      }
      strapi.log.error(`[sso] session creation failed: ${logSafe((err as Error).message)}`);
      failLogin(ctx, "session_failed");
    }
  },
});
