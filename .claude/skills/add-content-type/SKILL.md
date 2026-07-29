---
name: add-content-type
description: Step-by-step recipe for adding a Strapi content type end to end — schema, smart population, TS types, cache tags, revalidation webhook, public permissions, routing and seed. Use when asked to add or extend a content type / collection / single type (e.g. "add an Event type", "add a Press Release collection", "add a new single type for careers").
---

# Recipe: add a content type

A content type is not done when `schema.json` exists. It touches **seven** places, and
missing any one of them fails *silently*:

| Skipped | Symptom |
|---|---|
| `POPULATE` + controller | list endpoints over-fetch, or relations come back missing |
| Zod schema / TS types | the FE compiles but renders `undefined` |
| `tagsForEntry` | publishing never invalidates the FE — content looks permanently stale |
| `WATCHED_MODELS` | no webhook fires at all |
| `PUBLIC_READ_ACTIONS` | every FE read 403s |
| `tsconfig` JSON include | Strapi doesn't see the type at runtime |
| a route | the type exists in the admin and nowhere on the site |

Work through the steps in order. `<type>` is kebab-case singular (`press-release`).

---

## 1. Schema

`apps/cms/src/api/<type>/content-types/<type>/schema.json`

```json
{
  "kind": "collectionType",
  "collectionName": "press_releases",
  "info": {
    "singularName": "press-release",
    "pluralName": "press-releases",
    "displayName": "Press Release",
    "description": "Investor / media announcements (Req §x)."
  },
  "options": { "draftAndPublish": true },
  "pluginOptions": { "i18n": { "localized": true } },
  "attributes": {
    "title": { "type": "string", "required": true, "pluginOptions": { "i18n": { "localized": true } } },
    "slug": { "type": "uid", "targetField": "title", "required": true },
    "publishedDate": { "type": "date" },
    "body": { "type": "blocks" },
    "cover": { "type": "media", "multiple": false, "allowedTypes": ["images"] },
    "category": { "type": "relation", "relation": "manyToOne", "target": "api::category.category" },
    "seo": { "type": "component", "component": "shared.seo", "repeatable": false }
  }
}
```

Decisions worth making deliberately:

- **`draftAndPublish`** — on for anything editorial. It is also what the §4.5 workflow
  and scheduled publishing hang off.
- **`i18n.localized`** — per *attribute*. A `slug` is usually localized (VI/EN have
  independent URLs per Req §7); an `externalId` usually isn't.
- **`uid` on slug** with `targetField` gives editors auto-generation and uniqueness.
- **`allowedTypes: ["images"]`** on media. Never allow `files` on a public-facing
  media field without a reason — it widens what the virus scanner has to clear and
  what CloudFront will serve.
- **Attach `shared.seo`** to anything that gets its own URL, or it cannot have a
  canonical, an OG image or a `noindex` flag.

Then the standard trio (Strapi generates nothing for you here):

```ts
// apps/cms/src/api/<type>/routes/<type>.ts
import { factories } from "@strapi/strapi";
export default factories.createCoreRouter("api::<type>.<type>");

// apps/cms/src/api/<type>/services/<type>.ts
import { factories } from "@strapi/strapi";
export default factories.createCoreService("api::<type>.<type>");
```

## 2. Smart population (§4.4)

Add a `list` (cards) and `detail` (deep) clause in
`packages/shared/src/population.ts`:

```ts
export const PRESS_RELEASE_CARD_FIELDS = [
  "title", "slug", "publishedDate", "publishedAt",
] as const;

export const POPULATE = {
  // …existing…
  "press-release": {
    list: {
      cover: { fields: ["url", "alternativeText", "width", "height"] },
      seo: { fields: ["noindex"] },
      localizations: { fields: ["slug", "locale"] },
    },
    detail: {
      cover: true,
      category: { fields: ["name", "slug"] },
      seo: { populate: { ogImage: true } },
      localizations: { fields: ["slug", "locale"] },
    },
  },
};
```

Then force it server-side in the controller, so a client cannot ask for more:

```ts
// apps/cms/src/api/<type>/controllers/<type>.ts
import { factories } from "@strapi/strapi";
import { PRESS_RELEASE_CARD_FIELDS } from "@vng/shared";
import { applyDetailPopulate, applyListPopulate } from "../../../utils/populate";

export default factories.createCoreController("api::press-release.press-release", () => ({
  async find(ctx) {
    applyListPopulate(ctx, "press-release");
    ctx.query.fields = [...PRESS_RELEASE_CARD_FIELDS];
    return super.find(ctx);
  },
  async findOne(ctx) {
    applyDetailPopulate(ctx, "press-release");
    return super.findOne(ctx);
  },
}));
```

Forcing it in the controller rather than trusting the client is what keeps list
payloads small (Lighthouse) and stops `populate=*` from becoming an N+1 against RDS.

## 3. Types + Zod

`packages/shared/src/types/content-types.ts` — a `Card` and a full type:

```ts
export interface PressReleaseCard {
  documentId: string;
  title: string;
  slug: string;
  publishedDate: string | null;
  publishedAt: string | null;
  cover?: Media | null;
  seo?: { noindex?: boolean } | null;
  localizations?: Array<{ locale: Locale; slug: string }>;
}
export interface PressRelease extends PressReleaseCard { /* + body, category, … */ }
```

Add a Zod schema in `packages/shared/src/schemas/` if the FE parses it defensively
(any dynamic-zone block must). Then:

```bash
pnpm --filter @vng/cms generate:types   # Strapi's own generated types
pnpm --filter @vng/shared build          # Strapi consumes dist/index.cjs
```

## 4. Client methods

`packages/shared/src/client/strapi-client.ts`. Follow the existing two-hop pattern —
Strapi 5's `findOne` only takes a `documentId`, but routes only know a slug:

```ts
async getPressReleaseBySlug(slug: string, locale: Locale, preview = false) {
  const card = await findCardBySlug<PressReleaseCard>(
    config, "/press-releases", slug, locale, {}, [LIST_PRESS_TAG], preview,
  );
  if (!card) return null;
  return orNull(
    strapiRequest<StrapiSingleResponse<PressRelease>>(
      config, `/press-releases/${card.documentId}`, { locale },
      { tags: [pressTag(slug), LIST_PRESS_TAG], profile: "content", preview },
    ).then((res) => res.data),
  );
}
```

## 5. Cache tags + webhook (§5.2 / §5.3)

`packages/shared/src/client/tags.ts`:

```ts
export const LIST_PRESS_TAG = "list:press-releases";
export function pressTag(slug: string) { return `press-release:${slug}`; }

export type RevalidateModel = /* … */ | "press-release";

// inside tagsForEntry:
case "press-release": {
  if (p.slug) tags.add(pressTag(p.slug));
  tags.add(LIST_PRESS_TAG);
  break;
}
```

`apps/cms/src/webhooks/revalidation.ts`:

```ts
const WATCHED_MODELS = {
  // …existing…
  "api::press-release.press-release": "press-release",
};
```

If the FE has a detail route worth busting by path, add it to `pathsForEntry` in
`apps/web/app/api/revalidate/route.ts` — and note the slug/locale regex guard there,
which exists so an interpolated slug can't escape its route.

## 6. Permissions

`apps/cms/src/bootstrap/permissions.ts` → `PUBLIC_READ_ACTIONS`:

```ts
"api::press-release.press-release.find",
"api::press-release.press-release.findOne",
```

**Read-only actions only.** This array is also what
`revokePublicRead` operates on, so anything listed here is what gets *removed* when
the Content API is (as by default) token-authenticated. Never put a write action in it.

## 7. Route, metadata, sitemap

- Route: `apps/web/app/[locale]/thong-cao/[slug]/page.tsx` — fetch via
  `lib/strapi.ts`, `generateMetadata` via `buildMetadata`, JSON-LD via `<JsonLd>`.
- Sitemap: add the `kind` to `SitemapEntry`, to `getSitemapEntries`, and to
  `pathForKind` in `apps/web/app/sitemap.ts`. A routable type missing from the
  sitemap will not get crawled.
- Seed a row or two in `apps/cms/src/bootstrap/seed.ts` so the e2e suite has
  something to assert against. Keep it idempotent.

## Verify

```bash
pnpm --filter @vng/shared build && pnpm typecheck && pnpm lint
docker compose up --build cms web
curl -s -H "Authorization: Bearer $STRAPI_API_TOKEN" \
  "http://localhost:1337/api/press-releases?locale=vi" | jq '.data[0]'
# and confirm the draft guard holds:
curl -s -o /dev/null -w '%{http_code}\n' \
  "http://localhost:1337/api/press-releases?status=draft"   # expect 403
```

Then publish an entry in the admin and confirm the FE reflects it within ~2 s
**without a rebuild**. If it doesn't, step 5 is wrong.

Related: `.claude/skills/cms-strapi`, `.claude/skills/content-freshness`,
`.claude/skills/seo-aio`.
