import type { Core } from "@strapi/strapi";
import { assertLocalPluginsLoaded } from "./bootstrap/assert-plugins";
import { ensureLocales } from "./bootstrap/locales";
import { ensureContentApiAccess } from "./bootstrap/permissions";
import { seed, seedDemoRedirects, seedStaticPages } from "./bootstrap/seed";
import { registerDraftGuard } from "./middlewares/draft-guard";
import { setupUploadVirusScan } from "./upload/virus-scan";
import { registerRevalidationWebhook } from "./webhooks/revalidation";

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * P3: wire the document-service middleware that fires signed revalidation
   * webhooks to the web app on publish/update/unpublish (§5.3).
   *
   * P7 (§9): `draft-guard` is registered here too — it is a document-service
   * middleware, and installing it in `register()` guarantees it is in place
   * before the HTTP server accepts its first request. A guard that comes up a
   * moment late is a guard with a hole in it.
   *
   * Upload virus scanning is *not* here: it decorates
   * `strapi.plugin('upload').provider`, which the upload plugin's own
   * `register()` creates. The relative order of plugin and application register
   * hooks is not a contract to lean on, so it runs in `bootstrap()` instead.
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    registerRevalidationWebhook(strapi);
    registerDraftGuard(strapi);
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * P1: provision i18n locales (vi/en) and, when `SEED=true` on an empty DB,
   * load demo content. P2/P7: apply the Content-API access model — provision the
   * read-only API token and grant *or revoke* public read depending on
   * `CMS_PUBLIC_READ` (§9 "add API auth"). (P3 publish-webhook wiring lives in
   * `register()` above.)
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // First: refuse to start half-functional. Strapi skips a local plugin whose
    // entrypoint it cannot find *silently*, so this is the only thing standing
    // between a packaging mistake and a CMS whose audit log quietly does not exist.
    assertLocalPluginsLoaded(strapi);

    await ensureLocales(strapi);
    await ensureContentApiAccess(strapi);
    setupUploadVirusScan(strapi);

    if (process.env.SEED === "true") {
      try {
        await seed(strapi);
        // Both are separate from `seed()` because that one no-ops as soon as any
        // article exists. These upsert independently, so a database that drifted
        // (articles present, pages or redirects missing) self-heals on the next boot.
        await seedStaticPages(strapi);
        await seedDemoRedirects(strapi);
      } catch (err) {
        strapi.log.error("[seed] failed — continuing boot");
        strapi.log.error(err as Error);
      }
    }
  },
};
