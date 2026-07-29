/**
 * Content-API limits (P7 §9 hardening).
 *
 * Strapi's default `maxLimit` is `null` — unbounded. A single
 * `GET /api/articles?pagination[pageSize]=100000&populate=*` therefore asks
 * Postgres for the entire catalogue with every relation joined, in one request.
 * With "thousands of articles" (§0 business context) that is a one-line denial
 * of service against Postgres that also blows the ISR cache entry size.
 *
 * `maxLimit: 100` matches what the FE actually asks for: `getArticles` pages at
 * 12, and `getSitemapEntries` — the largest legitimate consumer — pages at 100
 * (`packages/shared/src/client/strapi-client.ts`). Anything above that is not a
 * client of ours.
 *
 * `withCount` stays on: the sitemap and pagination both need `pageCount`.
 *
 * `strictParams` rejects unrecognised query params outright instead of ignoring
 * them, which turns a typo'd filter into a 400 rather than a silently
 * unfiltered — and therefore over-broad — result set.
 */
export default ({ env }) => ({
  rest: {
    defaultLimit: env.int("API_DEFAULT_LIMIT", 25),
    maxLimit: env.int("API_MAX_LIMIT", 100),
    withCount: true,
    strictParams: env.bool("API_STRICT_PARAMS", true),
  },
});
