import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { loadResilient } from "@/lib/prerender";
import { strapi } from "@/lib/strapi";

/** Web app manifest — name/theme sourced from the CMS Global single type (§6.3). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const global = await loadResilient(() => strapi.getGlobal(routing.defaultLocale));
  const name = global?.siteName ?? "VNG";

  return {
    name,
    short_name: name,
    description: global?.siteDescription ?? undefined,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [],
  };
}
