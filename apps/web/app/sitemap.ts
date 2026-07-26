import type { Locale, SitemapEntry } from "@vng/shared";
import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/site";
import { strapi } from "@/lib/strapi";

/**
 * Dynamic sitemap (§6.3 / master_summary §5). Canonical URLs only, per-locale,
 * with `hreflang` alternates and `noindex` entries excluded. Self-heals on
 * publish via the `list` cacheLife on `getSitemapEntries` (§5.1). The article
 * index (`/tin-tuc`) is the only route with no backing CMS entry, so it is the
 * lone hard-coded path; home / marketing / landings all come from the CMS.
 */

/** Map a content kind + slug to its locale-agnostic route path (§5.1). */
function pathForKind(kind: SitemapEntry["kind"], slug: string): string {
  switch (kind) {
    case "article":
      return `/tin-tuc/${slug}`;
    case "landing":
      // The `home` landing is served at the locale root, not `/home`.
      return slug === "home" ? "/" : `/${slug}`;
    case "page":
      return `/${slug}`;
    case "category":
      return `/category/${slug}`;
    case "tag":
      return `/tag/${slug}`;
  }
}

function languagesFor(
  locale: Locale,
  path: string,
  localizations: SitemapEntry["localizations"],
  toPath: (slug: string) => string,
): Record<string, string> {
  const languages: Record<string, string> = {
    [locale]: absoluteUrl(getPathname({ locale, href: path })),
  };
  for (const loc of localizations) {
    languages[loc.locale] = absoluteUrl(
      getPathname({ locale: loc.locale, href: toPath(loc.slug) }),
    );
  }
  return languages;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locales: readonly Locale[] = routing.locales;
  const items: MetadataRoute.Sitemap = [];

  // Static route with no CMS entry: the article index.
  for (const locale of locales) {
    items.push({
      url: absoluteUrl(getPathname({ locale, href: "/tin-tuc" })),
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, absoluteUrl(getPathname({ locale: l, href: "/tin-tuc" }))]),
        ),
      },
    });
  }

  // CMS-backed entries, per locale (each localized URL is its own entry).
  for (const locale of locales) {
    const entries = await strapi.getSitemapEntries(locale);
    for (const entry of entries) {
      if (entry.noindex) continue;
      const path = pathForKind(entry.kind, entry.slug);
      items.push({
        url: absoluteUrl(getPathname({ locale, href: path })),
        lastModified: entry.lastModified,
        alternates: {
          languages: languagesFor(locale, path, entry.localizations, (s) =>
            pathForKind(entry.kind, s),
          ),
        },
      });
    }
  }

  return items;
}
