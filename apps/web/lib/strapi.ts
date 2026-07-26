import "server-only";
import { createStrapiClient } from "@vng/shared";

/**
 * The single typed Strapi client instance for this app (§4.4). Every route
 * fetches through this — never `fetch()` the CMS directly — so cache tags
 * and populate shaping stay consistent.
 */
export const strapi = createStrapiClient({
  baseUrl: process.env.STRAPI_URL ?? "http://localhost:1337",
  apiToken: process.env.STRAPI_API_TOKEN,
});
