import { defineRouting } from "next-intl/routing";

/**
 * next-intl routing config (§6.2). `vi` is the default locale, mirroring the
 * Strapi i18n default set in `apps/cms/src/bootstrap/locales.ts`.
 */
export const routing = defineRouting({
  locales: ["vi", "en"],
  defaultLocale: "vi",
  localePrefix: "always",
});
