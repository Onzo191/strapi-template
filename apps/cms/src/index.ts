import type { Core } from "@strapi/strapi";
import { ensureLocales } from "./bootstrap/locales";
import { ensurePublicReadPermissions } from "./bootstrap/permissions";
import { seed } from "./bootstrap/seed";

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * P1: provision i18n locales (vi/en) and, when `SEED=true` on an empty DB,
   * load demo content. P2: grant the public role read access so the FE can
   * fetch content. The publish-webhook lifecycle wiring (§5.3) lands in P3.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await ensureLocales(strapi);
    await ensurePublicReadPermissions(strapi);

    if (process.env.SEED === "true") {
      try {
        await seed(strapi);
      } catch (err) {
        strapi.log.error("[seed] failed — continuing boot");
        strapi.log.error(err as Error);
      }
    }
  },
};
