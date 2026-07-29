/**
 * SSO plugin — server entry (Req §8, §0 A3).
 *
 * Admin SSO via OIDC Authorization Code + PKCE against VNG's IdP, with MFA
 * assurance checked from the ID token's `acr`/`amr` claims.
 *
 * Strapi's built-in `admin.auth.providers` is an **Enterprise** feature, so on
 * Community edition the flow is implemented here. It is not a parallel session
 * system: it reuses `strapi.sessionManager('admin')`, the same mechanism the local
 * login controller uses, so SSO sessions inherit every lifetime configured in
 * `config/admin.ts`.
 */
import type { Core } from "@strapi/strapi";
import controllers from "./controllers";
import { createSsoEnforcement } from "./enforce";
import { oidcConfigFromEnv } from "./oidc";
import routes from "./routes";

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    // Mounted directly on the Koa app rather than via `config/middlewares.ts`
    // because it must see requests for the admin panel's HTML, which are served
    // by `strapi::public` / the admin's own static handler — i.e. it has to run
    // ahead of them, and plugin `register()` runs before the server mounts.
    strapi.server.use(createSsoEnforcement(strapi));

    const config = oidcConfigFromEnv();
    if (!config) {
      strapi.log.warn(
        "[sso] OIDC is not configured (OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET / " +
          "OIDC_REDIRECT_URI) — admin SSO is DISABLED and local password login is the only path. " +
          "Required before production (Req §8).",
      );
      return;
    }

    strapi.log.info(
      `[sso] OIDC enabled: issuer=${config.issuer} requireMfa=${config.requireMfa} ` +
        `enforce=${process.env.OIDC_ENFORCE === "true"} autoProvision=${config.autoProvision}`,
    );

    if (!config.requireMfa) {
      strapi.log.warn(
        "[sso] OIDC_REQUIRE_MFA=false — the CMS will accept single-factor IdP logins. " +
          "Req §8 asks for MFA; this should only be set while onboarding.",
      );
    }
    if (config.autoProvision && config.allowedEmailDomains.length === 0) {
      strapi.log.error(
        "[sso] OIDC_AUTO_PROVISION=true with no OIDC_ALLOWED_EMAIL_DOMAINS — any identity the " +
          "IdP will issue a token for can obtain a CMS account. Set the domain allow-list.",
      );
    }
  },

  controllers,
  routes,
};
