/**
 * Admin panel configuration.
 *
 * P7 adds **session timeout** (§9 "session timeout") and cookie hardening. The
 * numbers below replace Strapi 5's defaults, which are tuned for a hobby project
 * rather than a corporate CMS holding unpublished financial disclosures:
 *
 * | Setting                    | Strapi default | Here    | Why |
 * |----------------------------|----------------|---------|-----|
 * | `accessTokenLifespan`      | 30 min         | 15 min  | Window a stolen access token stays usable. |
 * | `idleSessionLifespan`      | 2 h            | 30 min  | Unattended laptop in an open-plan office. |
 * | `maxSessionLifespan`       | 24 h           | 8 h     | One working day; forces a fresh login (and a fresh IdP MFA check) daily. |
 * | `idleRefreshTokenLifespan` | 14 days        | 30 min  | "Remember me" must not outlive the working day either. |
 * | `maxRefreshTokenLifespan`  | 30 days        | 8 h     | Same. A 30-day refresh token on a shared workstation is a standing credential. |
 *
 * Deliberately, "remember me" is capped to the same 8 h as a normal session: the
 * feature stays usable within a shift but cannot mint a month-long credential.
 * Every value is env-overridable so ops can loosen for a specific team without a
 * code change — `ADMIN_SESSION_*` in `.env.example`.
 */
const seconds = (env, name: string, fallback: number) => env.int(name, fallback);

export default ({ env }) => {
  const isProd = env("NODE_ENV") === "production";

  return {
    auth: {
      secret: env("ADMIN_JWT_SECRET"),

      // §9 session timeout. See the table above.
      sessions: {
        accessTokenLifespan: seconds(env, "ADMIN_SESSION_ACCESS_TOKEN_SECONDS", 15 * 60),
        idleSessionLifespan: seconds(env, "ADMIN_SESSION_IDLE_SECONDS", 30 * 60),
        maxSessionLifespan: seconds(env, "ADMIN_SESSION_MAX_SECONDS", 8 * 60 * 60),
        idleRefreshTokenLifespan: seconds(env, "ADMIN_REFRESH_IDLE_SECONDS", 30 * 60),
        maxRefreshTokenLifespan: seconds(env, "ADMIN_REFRESH_MAX_SECONDS", 8 * 60 * 60),
      },

      cookie: {
        // `secure` must be false on the plain-http local stack or login fails
        // outright; in prod the refresh cookie must never travel unencrypted.
        secure: env.bool("ADMIN_COOKIE_SECURE", isProd),
        // `lax` (not `none`) — the admin is never embedded cross-site, and
        // `frameguard: deny` + `frame-ancestors 'none'` enforce that.
        sameSite: "lax",
      },
    },

    apiToken: {
      salt: env("API_TOKEN_SALT"),
    },
    transfer: {
      token: {
        salt: env("TRANSFER_TOKEN_SALT"),
      },
    },
    secrets: {
      encryptionKey: env("ENCRYPTION_KEY"),
    },
    flags: {
      // Off by default in prod: both phone home, and the NPS survey injects a
      // third-party origin into a panel whose CSP we just narrowed to 'self'.
      nps: env.bool("FLAG_NPS", !isProd),
      promoteEE: env.bool("FLAG_PROMOTE_EE", !isProd),
    },

    // Draft preview (§6.3): the admin "Preview" button opens the FE draft-mode
    // route with a shared secret. Enabled only when both env vars are set.
    preview: {
      enabled: Boolean(env("WEB_PREVIEW_URL") && env("PREVIEW_SECRET")),
      config: {
        allowedOrigins: [env("WEB_PREVIEW_URL")],
        async handler(
          uid: string,
          { documentId, locale }: { documentId: string; locale?: string },
        ) {
          const base = env("WEB_PREVIEW_URL");
          const secret = env("PREVIEW_SECRET");
          // Map the changed uid → the FE route to preview.
          const routeBySlug: Record<string, (slug: string) => string> = {
            "api::article.article": (slug) => `/tin-tuc/${slug}`,
            "api::landing-page.landing-page": (slug) => (slug === "home" ? "/" : `/${slug}`),
            "api::page.page": (slug) => `/${slug}`,
          };
          const builder = routeBySlug[uid];
          if (!builder) return null;

          // Look up the entry's slug for this locale.
          const entry = await strapi.documents(uid as never).findOne({
            documentId,
            locale,
            status: "draft",
            fields: ["slug"],
          });
          const slug = (entry as unknown as { slug?: string } | null)?.slug;
          if (!slug) return null;

          // The slug is interpolated into a path that the FE then resolves
          // against its own origin. A slug containing `..` or a scheme would
          // otherwise be a path-traversal / open-redirect seed carried across
          // the trust boundary on a URL that already holds the preview secret.
          if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)) {
            strapi.log.warn(`[preview] refusing to build a preview URL for unsafe slug: ${slug}`);
            return null;
          }

          const localePrefix = locale ? `/${locale}` : "/vi";
          const path = `${localePrefix}${builder(slug)}`;
          const url = new URL("/api/preview", base);
          url.searchParams.set("secret", secret);
          url.searchParams.set("url", path);
          return url.toString();
        },
      },
    },
  };
};
