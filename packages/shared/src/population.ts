/**
 * Smart-population strategy (§4.4) — the SINGLE SOURCE OF TRUTH.
 *
 * Consumed on both sides of the wire:
 *  - CMS controllers force `list` populate on `find` and `detail` populate on
 *    `findOne`, so REST responses stay card-shaped for lists and deep for
 *    detail regardless of client query (§4.4: "list endpoints return cards
 *    only; detail endpoints deep-populate").
 *  - The FE typed API client (P2) reuses the same clauses to build its
 *    `populate` params — avoiding over-fetching + N+1.
 *
 * Rules encoded here:
 *  - Lists select card fields + shallow relations only.
 *  - Detail deep-populates; dynamic zones use per-component `on` population
 *    (polymorphic blocks each declare exactly what they need).
 */

/** A Strapi populate value: `true`, a nested clause, or a field selection. */
export type PopulateClause = Record<string, unknown>;

/** Card fields returned by every article list endpoint. */
export const ARTICLE_CARD_FIELDS = [
  "title",
  "slug",
  "excerpt",
  "featured",
  "publishedAt",
  "locale",
] as const;

/** Shallow media selection for cards (keeps list payloads Lighthouse-small). */
const CARD_MEDIA = {
  fields: ["url", "alternativeText", "width", "height"],
} as const;

const SEO_POPULATE: PopulateClause = {
  ogImage: { fields: ["url", "alternativeText", "width", "height"] },
};

/** Sibling-locale slugs for hreflang (§6.3) — id/documentId come implicitly. */
const LOCALIZATIONS_POPULATE: PopulateClause = { fields: ["slug", "locale"] };

/** Minimal SEO on cards: just `noindex` so the sitemap can exclude them (§6.3). */
const CARD_SEO_POPULATE: PopulateClause = { fields: ["noindex"] };

/**
 * Per-component population for the page-builder dynamic zone (`blocks`).
 * Polymorphic → Strapi requires an `on` map keyed by component uid.
 */
export const BLOCKS_POPULATE: PopulateClause = {
  on: {
    "blocks.hero": { populate: { media: true, actions: true } },
    "blocks.rich-text": true,
    "blocks.media": { populate: { file: true } },
    "blocks.image-gallery": { populate: { images: { populate: { image: true } } } },
    "blocks.cta": { populate: { actions: true } },
    "blocks.feature-grid": { populate: { features: { populate: { link: true } } } },
    "blocks.stats": { populate: { stats: true } },
    "blocks.logo-cloud": { populate: { logos: { populate: { logo: true } } } },
    "blocks.timeline": { populate: { events: { populate: { media: true } } } },
    "blocks.leadership-grid": {
      populate: { leaders: { populate: { photo: true, socials: true } } },
    },
    "blocks.faq": { populate: { items: true } },
    "blocks.testimonial": { populate: { items: { populate: { avatar: true } } } },
    "blocks.embed": true,
    "blocks.article-carousel": {
      populate: {
        category: { fields: ["name", "slug"] },
        articles: { fields: ["title", "slug"], populate: { cover: CARD_MEDIA } },
      },
    },
    "blocks.contact-form": { populate: { fields: true } },
  },
};

/** Per-content-type populate clauses: `list` (cards) vs `detail` (deep). */
export const POPULATE = {
  article: {
    list: {
      cover: CARD_MEDIA,
      category: { fields: ["name", "slug"] },
      author: { fields: ["name", "slug"] },
      seo: CARD_SEO_POPULATE,
      localizations: LOCALIZATIONS_POPULATE,
    },
    detail: {
      cover: true,
      category: { fields: ["name", "slug"] },
      tags: { fields: ["name", "slug"] },
      author: { populate: { avatar: CARD_MEDIA, socialLinks: true } },
      seo: { populate: SEO_POPULATE },
      localizations: LOCALIZATIONS_POPULATE,
    },
  },
  "landing-page": {
    list: { seo: CARD_SEO_POPULATE, localizations: LOCALIZATIONS_POPULATE },
    detail: {
      blocks: BLOCKS_POPULATE,
      seo: { populate: SEO_POPULATE },
      localizations: LOCALIZATIONS_POPULATE,
    },
  },
  page: {
    list: { seo: CARD_SEO_POPULATE, localizations: LOCALIZATIONS_POPULATE },
    detail: {
      blocks: BLOCKS_POPULATE,
      seo: { populate: SEO_POPULATE },
      localizations: LOCALIZATIONS_POPULATE,
    },
  },
  category: {
    list: { localizations: LOCALIZATIONS_POPULATE },
    detail: {
      articles: { fields: ARTICLE_CARD_FIELDS, populate: { cover: CARD_MEDIA } },
      localizations: LOCALIZATIONS_POPULATE,
    },
  },
  tag: {
    list: { localizations: LOCALIZATIONS_POPULATE },
    detail: {
      articles: { fields: ARTICLE_CARD_FIELDS, populate: { cover: CARD_MEDIA } },
      localizations: LOCALIZATIONS_POPULATE,
    },
  },
  author: {
    list: { avatar: CARD_MEDIA },
    detail: { avatar: true, socialLinks: true },
  },
  navigation: {
    list: {},
    detail: { items: { populate: { page: { fields: ["slug"] }, children: true } } },
  },
  global: {
    list: {},
    detail: {
      logo: true,
      favicon: true,
      defaultSeo: { populate: SEO_POPULATE },
      socialLinks: true,
    },
  },
} as const satisfies Record<string, { list: PopulateClause; detail: PopulateClause }>;

export type PopulatableType = keyof typeof POPULATE;
