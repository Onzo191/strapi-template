import type { MetadataRoute } from "next";
import { absoluteUrl, siteUrl } from "@/lib/site";

/**
 * robots.txt (§6.3 / master_summary §5 "Noindex/indexation"). Site-wide rules
 * only — per-page `noindex` is emitted in each page's metadata (`buildMetadata`)
 * and those pages are also excluded from the sitemap. We disallow only internal
 * paths so search/AI crawlers reach all real content.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/_next/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteUrl.host,
  };
}
