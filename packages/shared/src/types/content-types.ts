/**
 * Content-type response shapes (§4.1) in Strapi 5 flattened format.
 *
 * `*Card` types are the trimmed shape returned by list endpoints (§4.4:
 * "list endpoints return cards only"); the full types are returned by detail
 * endpoints with deep population.
 */

import type { Block } from "./blocks";
import type { LinkComponent, NavItem, SeoComponent } from "./components";
import type { Locale, StrapiEntityMeta, StrapiMedia } from "./media";

/**
 * A sibling-locale reference (§6.3 hreflang). vi/en slugs are independent, so
 * the translated slug — not a prefix swap — is what an alternate URL needs.
 * Populated via `localizations: { fields: ["slug", "locale"] }` (§4.4).
 */
export interface LocalizationRef {
  id: number;
  documentId: string;
  slug: string;
  locale: Locale;
}

/** Minimal SEO projection carried on cards for sitemap noindex filtering (§6.3). */
export type CardSeo = Pick<SeoComponent, "noindex"> | null;

export interface Category extends StrapiEntityMeta {
  name: string;
  slug: string;
  description?: string | null;
  localizations?: LocalizationRef[];
}

/** Category detail (§4.4: `findOne` populates the category's article cards). */
export interface CategoryDetail extends Category {
  articles: ArticleCard[];
}

export interface Tag extends StrapiEntityMeta {
  name: string;
  slug: string;
  localizations?: LocalizationRef[];
}

/** Tag detail (§4.4: `findOne` populates the tag's article cards). */
export interface TagDetail extends Tag {
  articles: ArticleCard[];
}

export interface Author extends StrapiEntityMeta {
  name: string;
  slug: string;
  bio?: string | null;
  avatar?: StrapiMedia | null;
  email?: string | null;
  jobTitle?: string | null;
  socialLinks?: LinkComponent[];
}

/** Trimmed article shape for list/card views (§4.4). */
export interface ArticleCard extends StrapiEntityMeta {
  title: string;
  slug: string;
  excerpt?: string | null;
  featured: boolean;
  cover?: StrapiMedia | null;
  category?: Pick<Category, "id" | "documentId" | "name" | "slug"> | null;
  author?: Pick<Author, "id" | "documentId" | "name" | "slug"> | null;
  /** Sitemap noindex filtering (§6.3) — selected `noindex` only on list. */
  seo?: CardSeo;
  localizations?: LocalizationRef[];
}

/** Full article detail (deep-populated). */
export interface Article extends ArticleCard {
  body?: unknown[];
  tags?: Tag[];
  seo?: SeoComponent | null;
}

export interface LandingPageCard extends StrapiEntityMeta {
  title: string;
  slug: string;
  seo?: CardSeo;
  localizations?: LocalizationRef[];
}

export interface LandingPage extends LandingPageCard {
  blocks?: Block[];
  seo?: SeoComponent | null;
}

export interface PageCard extends StrapiEntityMeta {
  title: string;
  slug: string;
  seo?: CardSeo;
  localizations?: LocalizationRef[];
}

export interface Page extends PageCard {
  blocks?: Block[];
  seo?: SeoComponent | null;
}

export interface Redirect extends StrapiEntityMeta {
  from: string;
  to: string;
  permanent: boolean;
  statusCode: number;
}

export interface Navigation extends StrapiEntityMeta {
  title: string;
  slug: string;
  items?: NavItem[];
}

export interface Global extends StrapiEntityMeta {
  siteName: string;
  siteDescription?: string | null;
  logo?: StrapiMedia | null;
  favicon?: StrapiMedia | null;
  defaultSeo?: SeoComponent | null;
  socialLinks?: LinkComponent[];
  organizationSchema?: Record<string, unknown> | null;
}
