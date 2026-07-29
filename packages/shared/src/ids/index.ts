/**
 * Identifier generation shared by apps/web and apps/cms.
 *
 * UUIDv7 is the house identifier format: time-ordered, so it indexes and sorts
 * chronologically, and self-dating. It backs the Strapi `documentId` of every
 * content type (see apps/cms/src/bootstrap/document-ids.ts) as well as the
 * ad-hoc ids we mint ourselves, so that "when was this created" is answerable
 * from the id alone.
 *
 * Framework-free and dependency-free, so both the ESM (web) and CJS (Strapi)
 * builds of `@vng/shared` can consume them.
 */
export * from "./uuid";
