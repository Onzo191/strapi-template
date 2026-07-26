/**
 * Typed Strapi API client (§4.4) — the FE's single entry point for reading
 * CMS content. Consumes the smart-population config indirectly: list/detail
 * shaping for article/landing-page/page is enforced server-side by the CMS
 * controllers (`@vng/shared` `POPULATE`, shared with this same package), so
 * this client only adds filters/pagination/sort and the §5.2 cache tags.
 *
 * Strapi 5's REST `findOne` only accepts a `documentId` in the path, but FE
 * routes only know the slug. Content types whose `find` stays card-shaped
 * (article, landing-page, page, category, tag) are therefore fetched in two
 * hops: a light `find` by `filters[slug]` to resolve the `documentId`, then
 * `findOne(documentId)` for the deep-populated detail. Navigation and Global
 * force detail-populate on `find` itself (§4.4), so those resolve in one hop.
 */
import type {
  Article,
  ArticleCard,
  CategoryDetail,
  Global,
  LandingPage,
  LandingPageCard,
  Navigation,
  Page,
  PageCard,
  TagDetail,
} from "../types/content-types";
import type { Locale, StrapiCollectionResponse, StrapiSingleResponse } from "../types/media";
import { type StrapiClientConfig, StrapiNotFoundError, strapiRequest } from "./fetcher";
import {
  articleTag,
  categoryTag,
  GLOBAL_TAG,
  LIST_ARTICLES_TAG,
  LIST_LANDINGS_TAG,
  landingTag,
  navigationTag,
  pageTag,
  tagTag,
} from "./tags";

export interface CreateStrapiClientOptions {
  baseUrl: string;
  apiToken?: string;
}

export interface GetArticlesParams {
  locale: Locale;
  page?: number;
  pageSize?: number;
  /** Filter by category slug. */
  category?: string;
  /** Filter by tag slug. */
  tag?: string;
}

async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof StrapiNotFoundError) return null;
    throw err;
  }
}

/** Resolve a slug to its card + `documentId` via a card-shaped `find`. */
async function findCardBySlug<TCard extends { documentId: string }>(
  config: StrapiClientConfig,
  collectionPath: string,
  slug: string,
  locale: string,
  query: Record<string, unknown>,
  tags: string[],
): Promise<TCard | null> {
  const res = await strapiRequest<StrapiCollectionResponse<TCard>>(
    config,
    collectionPath,
    { locale, filters: { slug: { $eq: slug } }, pagination: { pageSize: 1 }, ...query },
    { tags, profile: "list" },
  );
  return res.data[0] ?? null;
}

export function createStrapiClient(options: CreateStrapiClientOptions) {
  const config: StrapiClientConfig = { baseUrl: options.baseUrl, apiToken: options.apiToken };

  return {
    /** Card-shaped article feed (§5.1: ISR, tag `list:articles` [+ `category`/`tag`]). */
    async getArticles(params: GetArticlesParams): Promise<StrapiCollectionResponse<ArticleCard>> {
      const filters: Record<string, unknown> = {};
      const tags = [LIST_ARTICLES_TAG];
      if (params.category) {
        filters.category = { slug: { $eq: params.category } };
        tags.push(categoryTag(params.category));
      }
      if (params.tag) {
        filters.tags = { slug: { $eq: params.tag } };
        tags.push(tagTag(params.tag));
      }

      return strapiRequest<StrapiCollectionResponse<ArticleCard>>(
        config,
        "/articles",
        {
          locale: params.locale,
          sort: ["publishedAt:desc"],
          pagination: { page: params.page ?? 1, pageSize: params.pageSize ?? 12 },
          ...(Object.keys(filters).length > 0 ? { filters } : {}),
        },
        { tags, profile: "list" },
      );
    },

    /** Deep-populated article detail (§5.1: tag `article:{id}` + `list:articles`). */
    async getArticleBySlug(slug: string, locale: Locale): Promise<Article | null> {
      const card = await findCardBySlug<ArticleCard>(config, "/articles", slug, locale, {}, [
        LIST_ARTICLES_TAG,
      ]);
      if (!card) return null;

      const tags = [articleTag(card.documentId), LIST_ARTICLES_TAG];
      if (card.category?.slug) tags.push(categoryTag(card.category.slug));

      return orNull(
        strapiRequest<StrapiSingleResponse<Article>>(
          config,
          `/articles/${card.documentId}`,
          { locale },
          { tags, profile: "content" },
        ).then((res) => res.data),
      );
    },

    /** Deep-populated landing page (§5.1: tag `landing:{slug}`). */
    async getLandingPageBySlug(slug: string, locale: Locale): Promise<LandingPage | null> {
      const card = await findCardBySlug<LandingPageCard>(
        config,
        "/landing-pages",
        slug,
        locale,
        {},
        [LIST_LANDINGS_TAG],
      );
      if (!card) return null;

      return orNull(
        strapiRequest<StrapiSingleResponse<LandingPage>>(
          config,
          `/landing-pages/${card.documentId}`,
          { locale },
          { tags: [landingTag(slug), LIST_LANDINGS_TAG], profile: "content" },
        ).then((res) => res.data),
      );
    },

    /** Deep-populated static-shell page (§5.1: static cacheLife, tag `page:{slug}`). */
    async getPageBySlug(slug: string, locale: Locale): Promise<Page | null> {
      const card = await findCardBySlug<PageCard>(config, "/pages", slug, locale, {}, [
        pageTag(slug),
      ]);
      if (!card) return null;

      return orNull(
        strapiRequest<StrapiSingleResponse<Page>>(
          config,
          `/pages/${card.documentId}`,
          { locale },
          { tags: [pageTag(slug)], profile: "static" },
        ).then((res) => res.data),
      );
    },

    /** Category + its article feed (§5.1: tag `category:{slug}` + `list:articles`). */
    async getCategoryBySlug(slug: string, locale: Locale): Promise<CategoryDetail | null> {
      const card = await findCardBySlug<{ documentId: string }>(
        config,
        "/categories",
        slug,
        locale,
        { fields: ["slug"] },
        [categoryTag(slug)],
      );
      if (!card) return null;

      return orNull(
        strapiRequest<StrapiSingleResponse<CategoryDetail>>(
          config,
          `/categories/${card.documentId}`,
          { locale },
          { tags: [categoryTag(slug), LIST_ARTICLES_TAG], profile: "list" },
        ).then((res) => res.data),
      );
    },

    /** Tag + its article feed (§5.1: tag `tag:{slug}` + `list:articles`). */
    async getTagBySlug(slug: string, locale: Locale): Promise<TagDetail | null> {
      const card = await findCardBySlug<{ documentId: string }>(
        config,
        "/tags",
        slug,
        locale,
        { fields: ["slug"] },
        [tagTag(slug)],
      );
      if (!card) return null;

      return orNull(
        strapiRequest<StrapiSingleResponse<TagDetail>>(
          config,
          `/tags/${card.documentId}`,
          { locale },
          { tags: [tagTag(slug), LIST_ARTICLES_TAG], profile: "list" },
        ).then((res) => res.data),
      );
    },

    /** Deep-populated navigation menu (§4.4: `find` already deep-populates). */
    async getNavigationBySlug(slug: string, locale: Locale): Promise<Navigation | null> {
      const res = await strapiRequest<StrapiCollectionResponse<Navigation>>(
        config,
        "/navigations",
        { locale, filters: { slug: { $eq: slug } }, pagination: { pageSize: 1 } },
        { tags: [navigationTag(locale)], profile: "content" },
      );
      return res.data[0] ?? null;
    },

    /** Global single type (§4.4: `find` already deep-populates). */
    async getGlobal(locale: Locale): Promise<Global | null> {
      return orNull(
        strapiRequest<StrapiSingleResponse<Global>>(
          config,
          "/global",
          { locale },
          { tags: [GLOBAL_TAG], profile: "static" },
        ).then((res) => res.data),
      );
    },
  };
}

export type StrapiClient = ReturnType<typeof createStrapiClient>;
