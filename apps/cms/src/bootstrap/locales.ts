/**
 * i18n locale provisioning (§4.6 — config).
 *
 * Ensures the vi + en content locales exist and makes `vi` the default
 * (VI-first business). Locales are DB rows, so they're created on bootstrap
 * rather than in static config. Idempotent.
 */
import type { Core } from "@strapi/strapi";

export async function ensureLocales(strapi: Core.Strapi): Promise<void> {
  const locales = strapi.plugin("i18n").service("locales");
  const existing: Array<{ code: string }> = await locales.find();
  const codes = new Set(existing.map((l) => l.code));

  if (!codes.has("en")) {
    await locales.create({ code: "en", name: "English (en)" });
    strapi.log.info("[bootstrap] created locale en");
  }
  if (!codes.has("vi")) {
    await locales.create({ code: "vi", name: "Vietnamese (vi)" });
    strapi.log.info("[bootstrap] created locale vi");
  }

  const current = await locales.getDefaultLocale();
  if (current !== "vi") {
    await locales.setDefaultLocale({ code: "vi" });
    strapi.log.info("[bootstrap] default locale set to vi");
  }
}
