/**
 * @vng/shared — cross-cutting types, population config and (later) the typed
 * API client, Zod schemas and cache-tag helpers shared between apps/web and
 * apps/cms.
 *
 * Dual-consumed: apps/web bundles the TS source (ESM); apps/cms (Strapi,
 * CommonJS) `require`s the compiled `dist/index.cjs` — see package.json
 * `exports.require`. Keep this barrel free of framework-specific imports.
 */

export const SHARED_PACKAGE = "@vng/shared" as const;
export type SharedPackage = typeof SHARED_PACKAGE;

// Typed API client (P2 §4.4) — cache-tagged Strapi REST access for apps/web.
export * from "./client";
// Smart-population strategy (§4.4) — single source of truth.
export {
  ARTICLE_CARD_FIELDS,
  BLOCKS_POPULATE,
  POPULATE,
  type PopulatableType,
  type PopulateClause,
} from "./population";
// Zod schemas per block (P2 §4.2) — defensive validation in the FE block registry.
export * from "./schemas";
export * from "./types/blocks";
export * from "./types/components";
export * from "./types/content-types";
// Portable content-model types (generated deliverable — consumed by the FE client).
export * from "./types/media";
