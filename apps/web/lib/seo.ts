import type { Locale, SeoComponent } from "@vng/shared";
import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { resolveMediaUrl } from "./media";
import { absoluteUrl } from "./site";

/** A sibling-locale slug pairing used to build hreflang alternates (§6.3). */
export interface AlternateLocalization {
  locale: Locale;
  slug: string;
}

export interface BuildMetadataOptions {
  /** The locale of the page being rendered. */
  locale: Locale;
  /**
   * The current page's locale-agnostic path (no locale prefix), e.g.
   * `/tin-tuc/my-slug` or `/about`. Used for the canonical + self hreflang.
   */
  path: string;
  /** Sibling-locale entries (`article.localizations`, …) for hreflang. */
  localizations?: AlternateLocalization[];
  /**
   * Build a sibling-locale path from that locale's slug. Omit for fixed pages
   * whose path is identical across locales (home, /about, /legal).
   */
  toPath?: (slug: string) => string;
  /** Open Graph type — `article` for news, else `website` (default). */
  ogType?: "website" | "article";
  siteName?: string;
}

const OG_LOCALE: Record<Locale, string> = { vi: "vi_VN", en: "en_US" };

/** Locale-prefixed absolute URL for a route path (§6.2: `localePrefix: always`). */
function localizedUrl(locale: Locale, path: string): string {
  return absoluteUrl(getPathname({ locale, href: path }));
}

/**
 * hreflang alternates (§6.3). Emits the current locale, every sibling
 * localization, and `x-default` → the default locale (vi). For fixed pages
 * (no `toPath`) the path is shared across locales; only the prefix differs.
 */
function hreflangAlternates(opts: BuildMetadataOptions): Record<string, string> {
  const languages: Record<string, string> = {
    [opts.locale]: localizedUrl(opts.locale, opts.path),
  };
  for (const loc of opts.localizations ?? []) {
    const siblingPath = opts.toPath ? opts.toPath(loc.slug) : opts.path;
    languages[loc.locale] = localizedUrl(loc.locale, siblingPath);
  }
  // x-default points at the default-locale variant when we have it.
  const defaultLocale = routing.defaultLocale as Locale;
  if (languages[defaultLocale]) {
    languages["x-default"] = languages[defaultLocale];
  }
  return languages;
}

/**
 * Shared SEO component (§4.3) → Next Metadata API (§6.3). The single mapping
 * point reused across every route: title/description/canonical/OG/robots plus
 * hreflang alternates and keywords. `opts` is optional so callers that only
 * have a fallback title still work, but routes should pass it to get canonical
 * + hreflang right.
 */
export function buildMetadata(
  seo: SeoComponent | null | undefined,
  fallback: { title: string; description?: string },
  opts?: BuildMetadataOptions,
): Metadata {
  const title = seo?.metaTitle ?? fallback.title;
  const description = seo?.metaDescription ?? fallback.description;
  const ogImageUrl = seo?.ogImage ? resolveMediaUrl(seo.ogImage.url) : undefined;

  const canonical = seo?.canonicalURL ?? (opts ? localizedUrl(opts.locale, opts.path) : undefined);
  const languages = opts ? hreflangAlternates(opts) : undefined;

  return {
    title,
    description,
    keywords: seo?.keywords ?? undefined,
    alternates: canonical || languages ? { canonical, languages } : undefined,
    robots: seo?.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      type: opts?.ogType ?? "website",
      url: canonical,
      siteName: opts?.siteName,
      locale: opts ? OG_LOCALE[opts.locale] : undefined,
      images: ogImageUrl ? [{ url: ogImageUrl }] : undefined,
    },
    twitter: ogImageUrl
      ? { card: "summary_large_image", title, description, images: [ogImageUrl] }
      : { card: "summary", title, description },
  };
}
