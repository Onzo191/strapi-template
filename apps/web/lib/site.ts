/**
 * Public site origin (§6.3) — the canonical absolute base for metadata,
 * canonical/hreflang links, sitemap and JSON-LD `url`s. Distinct from
 * `STRAPI_URL` (the internal CMS origin used for fetches + media): this is the
 * user-facing domain, e.g. `https://vng.com.vn`.
 *
 * `NEXT_PUBLIC_` so it is inlined for any client usage and available in the
 * metadata layer; defaults to localhost for dev.
 */
export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

/** Absolute URL for a site-relative path (leading slash optional). */
export function absoluteUrl(path = "/"): string {
  return new URL(path, siteUrl).toString();
}
