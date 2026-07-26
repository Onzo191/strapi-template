/**
 * Content-type response shapes (§4.1) in Strapi 5 flattened format.
 *
 * `*Card` types are the trimmed shape returned by list endpoints (§4.4:
 * "list endpoints return cards only"); the full types are returned by detail
 * endpoints with deep population.
 */

import type { Block } from "./blocks";
import type { LinkComponent, NavItem, SeoComponent } from "./components";
import type { StrapiEntityMeta, StrapiMedia } from "./media";

export interface Category extends StrapiEntityMeta {
  name: string;
  slug: string;
  description?: string | null;
}

/** Category detail (§4.4: `findOne` populates the category's article cards). */
export interface CategoryDetail extends Category {
  articles: ArticleCard[];
}

export interface Tag extends StrapiEntityMeta {
  name: string;
  slug: string;
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
}

export interface LandingPage extends LandingPageCard {
  blocks?: Block[];
  seo?: SeoComponent | null;
}

export interface PageCard extends StrapiEntityMeta {
  title: string;
  slug: string;
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
