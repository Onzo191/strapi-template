/**
 * Strapi 5 media & primitive response shapes (flattened v5 format).
 *
 * Strapi 5 REST returns flattened entities — attributes live at the top level
 * (no `.attributes` wrapper) and every entry carries a `documentId`. These
 * types mirror that shape so the FE typed client (P2) can consume responses
 * without casting.
 */

/** A single format variant produced by the upload pipeline (thumbnail, etc.). */
export interface StrapiMediaFormat {
  name: string;
  hash: string;
  ext: string;
  mime: string;
  width: number;
  height: number;
  size: number;
  sizeInBytes: number;
  url: string;
}

/** An uploaded media file (image/video/document) as returned by Strapi 5. */
export interface StrapiMedia {
  id: number;
  documentId: string;
  name: string;
  alternativeText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  formats: Record<string, StrapiMediaFormat> | null;
  hash: string;
  ext: string;
  mime: string;
  size: number;
  url: string;
  previewUrl: string | null;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields present on every content-type entry in Strapi 5. */
export interface StrapiEntityMeta {
  id: number;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  locale: string | null;
}

/** Standard list response envelope (`GET /api/<plural>`). */
export interface StrapiCollectionResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

/** Standard single-entry response envelope (`GET /api/<plural>/<id>`). */
export interface StrapiSingleResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}

/** Supported content locales (mirrors Strapi i18n + next-intl). */
export type Locale = "vi" | "en";
