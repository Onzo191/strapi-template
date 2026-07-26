import type { SeoComponent } from "@vng/shared";
import type { Metadata } from "next";
import { resolveMediaUrl } from "./media";

/** Shared SEO component (§4.3) → Next Metadata API mapping, reused across article/landing/page routes. */
export function buildMetadata(
  seo: SeoComponent | null | undefined,
  fallback: { title: string; description?: string },
): Metadata {
  return {
    title: seo?.metaTitle ?? fallback.title,
    description: seo?.metaDescription ?? fallback.description,
    alternates: seo?.canonicalURL ? { canonical: seo.canonicalURL } : undefined,
    robots: seo?.noindex ? { index: false, follow: false } : undefined,
    openGraph: seo?.ogImage ? { images: [{ url: resolveMediaUrl(seo.ogImage.url) }] } : undefined,
  };
}
