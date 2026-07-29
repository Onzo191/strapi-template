import type { Core } from "@strapi/strapi";
import { uuidv7 } from "@vng/shared";

/**
 * Make every content type mint UUIDv7 `documentId`s instead of Strapi's cuid2.
 *
 * ## Why
 *
 * `documentId` is the identifier that leaves this system: it is in admin URLs, in
 * the Content-API responses the web app consumes, in the revalidation webhook
 * payload and in the audit log's `entryDocumentId`. Strapi mints it with
 * `@paralleldrive/cuid2`, which is collision-resistant but carries no time
 * information, so the ids sort arbitrarily and cannot be dated. UUIDv7 is
 * time-ordered (see `uuidv7` in `@vng/shared`), which gives us a chronological
 * sort and index locality on `document_id`, a creation time recoverable from the
 * id alone when correlating an audit-log row against a webhook delivery, and a
 * standard format (RFC 9562) that every consumer already parses.
 *
 * ## How
 *
 * Strapi injects `documentId` as a model attribute with a *function* default —
 * `@strapi/core/utils/transform-content-types-to-models` sets
 * `{ type: 'string', default: createDocumentId }` — and `@strapi/database`'s
 * `processData` calls that function whenever a create supplies no documentId.
 * There is no configuration hook for it, so we swap the function on the loaded
 * DB metadata. That is one assignment per content type and it covers every write
 * path automatically: admin, Content API, the seed, i18n locale creation and
 * `document.clone`.
 *
 * ## Timing
 *
 * This must run after `strapi.db.init()` (which populates `strapi.db.metadata`)
 * and before anything creates an entry. `strapi::content-types.beforeSync` is
 * exactly that window — it fires between `db.init()` and `db.schema.sync()`, so
 * ahead of the plugin `bootstrap()`s that provision the users-permissions roles.
 * Registering the hook from our `register()` is therefore correct; doing the work
 * in our own `bootstrap()` would be too late for those first few rows.
 *
 * ## The one sharp edge: never pass a bare documentId as a relation
 *
 * Strapi lets you set a relation with a bare scalar and guesses what it means:
 *
 *     // @strapi/core .../document-service/transform/relations/utils/map-relation.js
 *     const isNumeric = (value) => !Number.isNaN(parseInt(value, 10));
 *     if (isNumeric(relation))          callback({ id: relation });         // entity id
 *     if (typeof relation === 'string') callback({ documentId: relation }); // documentId
 *
 * A UUIDv7 begins with the hex of a 48-bit millisecond timestamp, whose leading
 * digit is decimal `0`–`9` until roughly the year 2317. So `parseInt` succeeds,
 * every UUIDv7 takes the *numeric* branch, and the string is treated as an entity
 * id: never resolved, then compared against an integer column. The failure surfaces
 * as a bare `ValidationError: Invalid relations` with no mention of ids — the
 * Postgres type error is swallowed because `checkRelationsExist` only re-raises
 * `ValidationError`s. cuid2 ids start with a letter, so they took the other branch
 * and this heuristic used to work by luck.
 *
 * Always use the explicit object form, which skips the heuristic:
 *
 *     data: { category: { documentId }, tags: [{ documentId }, …] }
 *
 * `bootstrap/seed.ts` has a `rel()` helper for exactly this. The admin panel and
 * `@vng/shared`'s client are unaffected — they already send the long form — but any
 * new seed, migration or import script must follow the same rule.
 *
 * ## Existing data
 *
 * Nothing is migrated. `document_id` is an opaque `varchar` with no format
 * validation anywhere in Strapi, so cuid2 ids already in the database keep
 * resolving; only new documents get UUIDv7. `uuidV7Timestamp` returns `null` for
 * the old ones, which is why it is documented to do that rather than throw.
 */
export function registerUuidV7DocumentIds(strapi: Core.Strapi) {
  strapi.hook("strapi::content-types.beforeSync").register(async () => {
    let replaced = 0;

    for (const meta of strapi.db.metadata.values()) {
      const attribute = meta.attributes?.documentId as
        | { type?: string; default?: unknown }
        | undefined;

      // Components have no documentId — only content types do. Skip quietly.
      if (!attribute) continue;

      // Fail loudly rather than silently keeping cuid2. If a Strapi upgrade stops
      // expressing this default as a function, the swap below would be a no-op
      // and we would only notice by eyeballing ids months later.
      if (typeof attribute.default !== "function") {
        throw new Error(
          `[document-ids] Expected "${meta.uid}".documentId to have a function default ` +
            `(got ${typeof attribute.default}). Strapi's documentId generation has moved — ` +
            "re-check apps/cms/src/bootstrap/document-ids.ts against @strapi/core " +
            "utils/transform-content-types-to-models before shipping.",
        );
      }

      attribute.default = uuidv7;
      replaced += 1;
    }

    if (replaced === 0) {
      throw new Error(
        "[document-ids] Found no content type with a documentId attribute. DB metadata was " +
          "empty or its shape changed; UUIDv7 documentIds are NOT in force.",
      );
    }

    strapi.log.info(`[document-ids] UUIDv7 documentIds enabled for ${replaced} content types`);
  });
}
