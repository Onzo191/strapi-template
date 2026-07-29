# apps/web — frontend agent notes

Next.js 16, App Router, RSC-first. Renders everything from Strapi through a typed
client, with ISR + cache tags for freshness. Read [../../AGENTS.md](../../AGENTS.md)
first for the content-vs-code rule and the security invariants.

## Routing map

```
app/
├─ [locale]/                        next-intl segment — `vi` | `en`
│  ├─ layout.tsx                    html/body, fonts, ThemeProvider, Header/Footer
│  ├─ (marketing)/
│  │  ├─ page.tsx                   home — the `home` landing page from the CMS
│  │  ├─ about/page.tsx             the `about` CMS page
│  │  └─ legal/page.tsx
│  ├─ tin-tuc/
│  │  ├─ page.tsx                   article index (paginated)
│  │  └─ [slug]/page.tsx            article detail
│  ├─ category/[slug]/page.tsx      taxonomy feed
│  ├─ tag/[slug]/page.tsx           taxonomy feed
│  └─ [...slug]/page.tsx            catch-all → landing page / CMS page
├─ api/
│  ├─ revalidate/route.ts           signed webhook → revalidateTag  (§5.3)
│  └─ preview/route.ts, preview/exit/route.ts   draft mode          (§6.3)
├─ sitemap.ts  robots.ts  manifest.ts
proxy.ts                            middleware: 301 redirects → locale routing
```

`proxy.ts` is Next's middleware (named `proxy.ts` in Next 16). It resolves the
legacy-404 map **before** locale routing, so an old URL redirects rather than 404s.

## Where to add things

| I want to… | Do this |
|---|---|
| Add a page-builder block | Strapi component + `components/blocks/<name>.tsx` + register it in `components/blocks/registry.tsx` + a Zod schema in `@vng/shared`. Recipe: `.claude/skills/add-page-builder-block`. |
| Add a route | A new segment under `app/[locale]/`. Fetch through `lib/strapi.ts`, tag the fetch, add `generateMetadata` via `lib/seo.ts`. |
| Add a UI primitive | `packages/design-system` — not here. This app composes; it does not define primitives. |
| Add a locale | `.claude/skills/add-language` — `i18n/routing.ts`, `messages/<locale>.json`, and a Strapi locale. |
| Change metadata / JSON-LD | `lib/seo.ts` (`buildMetadata`) and `lib/jsonld.ts`. Emit JSON-LD through `components/seo/json-ld.tsx`, never a raw `<script>`. |

## Data fetching — the rules

**Every** CMS read goes through `lib/strapi.ts`. It is a single
`createStrapiClient()` instance, so cache tags and the smart-population shape stay
consistent, and the API token is applied in one place.

```ts
import { strapi } from "@/lib/strapi";
const article = await strapi.getArticleBySlug(slug, locale);
```

Do **not** `fetch()` the CMS directly from a route or component. An ad-hoc fetch is
untagged, which means the page it renders will serve stale content until its
time-based revalidation window expires — the exact failure the tag scheme exists to
prevent, and one that is invisible in development.

`lib/prerender.ts`'s `loadResilient()` wraps CMS reads that must not break the
build: it returns `null`/empty on a CMS error rather than failing the render. Use it
in layouts and at build time; let genuine 404s in page bodies call `notFound()`.

## Cache tags

The scheme is defined once in `packages/shared/src/client/tags.ts` and consumed by
both the fetch layer and `/api/revalidate`. Adding a content type means adding its
tag there and to `tagsForEntry`, or publishing it will never invalidate anything.

| Change | Tags invalidated |
|---|---|
| Article publish/update | `article:{documentId}`, `list:articles`, `category:{slug}`, `tag:{slug}` |
| Landing page | `landing:{slug}`, `list:landings` |
| Navigation | `navigation:{locale}` |
| Global / SEO defaults | `global` |

`cacheLife` profiles (`packages/shared/src/client/cache.ts`): `static` (1d),
`content` (1h SWR), `list` (10m SWR). The time-based window is the safety net for a
webhook that never arrived — never remove it in favour of "tags handle it".

## Rendering

- **RSC by default.** `"use client"` belongs on the smallest interactive leaf:
  carousels, the contact form, the theme toggle, the mobile nav. A client component
  high in the tree pulls everything below it client-side and costs the Lighthouse
  budget.
- **Never `generateStaticParams` over the article catalogue.** Content pages are ISR;
  see the content-vs-code rule in AGENTS.md.
- `next/image` with explicit `sizes`, `priority` only on the LCP element.
- Fonts are self-hosted via `next/font` with the `vietnamese` subset. Adding a
  weight adds preloaded bytes to the critical path — check the Lighthouse budget.
- Wrap below-the-fold blocks in `Suspense` with a skeleton, and in `Reveal`
  (design-system) for motion. `Reveal` short-circuits under
  `prefers-reduced-motion`; don't reimplement the animation locally.

## Security notes specific to this app

- **CMS strings are untrusted.** Run every href through `safeHref` and every iframe
  src through `safeFrameSrc` (both from `@vng/shared`). `SmartLink` already does
  this, so use it rather than a bare `<a>` for anything CMS-authored.
- **JSON-LD goes through `components/seo/json-ld.tsx`**, which escapes `<` so an
  editor-authored string cannot break out of the script tag.
- **Security headers and CSP** are built in `lib/security-headers.ts` and emitted
  from `next.config.ts` `headers()`. They are *static* on purpose — a per-request
  CSP nonce would force every page dynamic and destroy ISR. That trade-off, and
  what compensates for it, is documented at the top of that file and in
  `docs/adr/007-csp-without-nonces.md`.
- **`lib/rate-limit.ts` is per-instance** (in-process). It is a second-order brake
  behind the HMAC on `/api/revalidate` and a brute-force cost on `/api/preview` —
  not a cluster-wide control. The CMS's limiter is in-process too — sound only
  because each app runs as one instance ([ADR-008](../../docs/adr/008-single-instance.md)).
- **`STRAPI_PREVIEW_TOKEN` must be a full-access Strapi token.** The CMS's draft
  guard only lets that token type read unpublished content; a read-only token here
  fails silently by serving published copy in preview mode.

## Testing

`docker compose up` first — `next dev` does not use the production ISR cache, so
ISR and tag invalidation cannot be validated against it.

```bash
pnpm --filter @vng/qa e2e         # Playwright: journeys, SEO, a11y, headers
pnpm --filter @vng/qa lighthouse  # perf/SEO/a11y/BP ≥ 95, LCP < 2.5s, CLS < 0.1
```
