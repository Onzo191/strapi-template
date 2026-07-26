export default ({ env }) => ({
  auth: {
    secret: env("ADMIN_JWT_SECRET"),
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
    nps: env.bool("FLAG_NPS", true),
    promoteEE: env.bool("FLAG_PROMOTE_EE", true),
  },
  // Draft preview (§6.3): the admin "Preview" button opens the FE draft-mode
  // route with a shared secret. Enabled only when both env vars are set.
  preview: {
    enabled: Boolean(env("WEB_PREVIEW_URL") && env("PREVIEW_SECRET")),
    config: {
      allowedOrigins: [env("WEB_PREVIEW_URL")],
      async handler(uid: string, { documentId, locale }: { documentId: string; locale?: string }) {
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

        const localePrefix = locale ? `/${locale}` : "/vi";
        const path = `${localePrefix}${builder(slug)}`;
        const url = new URL("/api/preview", base);
        url.searchParams.set("secret", secret);
        url.searchParams.set("url", path);
        return url.toString();
      },
    },
  },
});
