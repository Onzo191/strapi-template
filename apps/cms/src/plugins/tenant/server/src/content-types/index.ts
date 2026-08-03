import siteAssignmentSchema from "./site-assignment/schema.json";

/**
 * The assignment table is hidden from both the content manager and the
 * content-type builder (see its `pluginOptions`): it is the permission model, not
 * content, and a table an editor can open is a table an editor can grant
 * themselves a site in.
 *
 * Note the attribute names — `siteDocumentId`, not `documentId`. Strapi reserves
 * `documentId` on every model and `transformContentTypesToModels` throws before
 * the HTTP server starts if a content type declares it (docs/adr/004).
 */
export default {
  "site-assignment": { schema: siteAssignmentSchema },
};
