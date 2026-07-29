# AGENTS.md — VNG Platform

Root map for any coding agent working in this repo. Read this before touching
anything; it is short by design. Detail lives in `.claude/skills/` (loaded on
demand) and `docs/` (read when a skill points you there).

Companion files: [CLAUDE.md](CLAUDE.md) (Claude-specific commands and safety
notes), [apps/web/CLAUDE.md](apps/web/CLAUDE.md),
[apps/cms/CLAUDE.md](apps/cms/CLAUDE.md).

---

## What this is

The CMS-driven corporate site for **vng.com.vn** — bilingual (VI/EN), thousands of
articles, first-class SEO/AIO, editors autonomous from engineering. Soft launch
~20/09/2026.

| | |
|---|---|
| **Monorepo** | pnpm 10 workspaces + Turborepo 2 |
| **Web** | Next.js 16 — App Router, RSC, React 19, Tailwind v4, next-intl |
| **CMS** | Strapi 5 **Community** + Postgres 17 |
| **Shared** | `@vng/design-system` (shadcn/ui), `@vng/shared` (contracts, dual-built) |
| **QA** | Playwright + Lighthouse CI in `qa/` |
| **Infra** | Two Docker images (web, cms), **one instance each** — see [ADR-008](docs/adr/008-single-instance.md). Deployment is a separate team's. |
| **Docs** | Docusaurus in `docs/` — ADRs + task recipes |

---

## The one rule that matters most: content vs code

> **A content change is never a deploy. A code change is never a content operation.**

- **Content change** → editor publishes in Strapi → signed webhook → `revalidateTag()`
  on the web app → the next request serves fresh HTML. **No build, no deploy**,
  typically live in under two seconds.
- **Code change** → CI builds the affected app(s) → deploys to ECS.

Two things follow, and both are easy to break by accident:

1. **Never add `generateStaticParams` over the full article catalogue.** It would
   turn every publish into a rebuild and make deploy time grow with content.
   Content pages are ISR + tags, always.
2. **Never invalidate by rebuilding.** If you find yourself wanting to redeploy to
   make content appear, the cache-tag wiring is wrong — fix that instead
   (`.claude/skills/content-freshness`).

---

## Commands

```bash
pnpm install                     # always pnpm, never npm/yarn

pnpm dev                         # all apps (turbo)
pnpm build                       # affected builds
pnpm lint                        # Biome — NOT ESLint/Prettier
pnpm lint:fix                    # Biome check --write
pnpm typecheck                   # tsc --noEmit everywhere
pnpm test                        # unit tests (node:test)

docker compose up                # postgres + cms + web  (clamav behind --profile scan)
pnpm --filter @vng/qa e2e        # Playwright
pnpm --filter @vng/qa lighthouse # Lighthouse CI budgets
pnpm --filter @vng/qa load:revalidate   # revalidate-path load test
```

`docker compose up` is the real local stack — production images, production
`NODE_ENV`, token-authenticated Content API. Stateful services live in
`docker-compose.infra.yml` (pulled in via `include`), so you can bring the database
up once and restart the apps freely on top of it.

**One instance of each app, deliberately.** The ISR cache is Next's own
per-instance cache, so a second web replica would serve content the publish webhook
never invalidated. Read [ADR-008](docs/adr/008-single-instance.md) before adding
one.

---

## Where things live

```
apps/web/          Next.js — app/, components/blocks/ (page-builder registry), lib/
apps/cms/          Strapi — src/api/ (content types), src/components/ (blocks),
                   src/plugins/{editorial,sso}/, src/middlewares/, src/upload/
packages/shared/   Types, typed Strapi client, cache tags, Zod schemas, security helpers
packages/design-system/  shadcn/ui components, tokens, theming, motion
qa/                Playwright e2e, Lighthouse CI, load tests
docs/              Docusaurus: ADRs (docs/adr/) + recipes
infra/             Lambda sources (virus scan)
.claude/skills/    Task recipes — read the one that matches your task
```

---

## Task → skill routing

Do **not** read every doc up front. Match your task and load that skill.

| Task touches… | Skill |
|---|---|
| UI components, CMS blocks, styling, tokens, motion | `design-system` |
| Strapi content-types, schemas, seed, plugins | `cms-strapi` |
| `<head>` metadata, JSON-LD, sitemap, hreflang, redirects | `seo-aio` |
| Locale routing, `messages/*.json`, translations | `i18n-routing` |
| Cache revalidation, webhooks, ISR, freshness | `content-freshness` |
| Playwright e2e, Lighthouse | `qa-e2e` |
| Auth, CSP, rate limits, SSO, secrets, uploads | `security` |

Step-by-step recipes for the five most common changes:

| I want to… | Recipe |
|---|---|
| Add a content type | `.claude/skills/add-content-type` |
| Add a page-builder block | `.claude/skills/add-page-builder-block` |
| Add a theme | `.claude/skills/add-theme` |
| Add a language | `.claude/skills/add-language` |
| Wire a revalidation webhook | `.claude/skills/wire-revalidation-webhook` |

Architectural *why* lives in [docs/adr/](docs/adr/). Read an ADR before
overturning the decision it records.

---

## Do

- **Server Components by default.** `"use client"` only for genuine interactivity
  or browser APIs, and only on the smallest possible leaf.
- **Import UI from `@vng/design-system`**, cross-app contracts from `@vng/shared`.
  Do not re-implement a primitive locally.
- **Every CMS fetch goes through the typed client** (`apps/web/lib/strapi.ts`), so
  cache tags and populate shaping stay consistent. Never `fetch()` Strapi directly
  from a route.
- **Tag every fetch** per the §5.2 scheme in `packages/shared/src/client/tags.ts`.
  An untagged fetch is a page that will serve stale content forever.
- **Run URLs through `safeHref` / `safeFrameSrc`** (`@vng/shared`) before they
  reach the DOM. Everything in the CMS is editor-authored, and an editor is not a
  trust boundary.
- **Extend the block registry**, don't special-case a block in a page component.
- **Conventional Commits** — commitlint enforces it.

## Don't

- `npm` / `yarn` — pnpm only, and the lockfile is committed.
- ESLint / Prettier — Biome only.
- `generateStaticParams` over content collections (see above).
- `dangerouslySetInnerHTML` with CMS data. The two existing uses emit escaped
  `application/ld+json` via `components/seo/json-ld.tsx`; use that.
- New dependencies without a reason worth writing down. Everything is pinned
  (`VERSIONS.md`); a major bump needs an ADR.
- Commit or push unless you were asked to.

---

## Security invariants

These are enforced in code. If a change makes one of them false, that change is
wrong — see `.claude/skills/security` and
[docs/adr/006-security-hardening.md](docs/adr/006-security-hardening.md).

1. **The Content API requires a token.** The public role has no read permissions;
   the web app authenticates with a read-only API token.
2. **Draft content requires a full-access token.** `?status=draft` from a
   read-only or anonymous caller is a 403 — unpublished press releases are not
   public. Enforced in `apps/cms/src/middlewares/draft-guard.ts`.
3. **Unauthenticated endpoints are signed + replay-bounded.** `/api/revalidate`
   and `/api/upload-scan/callback` verify an HMAC over `<timestamp>.<body>` and
   reject anything outside a 5-minute window.
4. **No CMS string reaches an HTML/URL sink unchecked.** See "Do" above.
5. **Admin sessions are short.** 15-min access token, 30-min idle, 8-h absolute.
   Don't lengthen them without a written reason.
6. **Uploads are scanned, and the scanner fails closed.** An unavailable scanner
   rejects the upload rather than storing an unscanned file.
7. **Secrets come from the environment**, and in AWS from Secrets Manager. No
   secret is ever committed — `docker-compose.yml` holds obvious dev-only
   placeholders and nothing else.

---

## Gotchas that have already cost time

- **`packages/shared` is dual-built.** The web app bundles the TS source; Strapi
  `require`s `dist/index.cjs`. Keep the barrel free of framework imports, and run
  `pnpm --filter @vng/shared build` after changing it or the CMS will use a stale
  copy.
- **Strapi loads schemas from `dist`.** `apps/cms/tsconfig.json` must keep
  `src/**/*.json` in `include`, or content types silently vanish.
- **Koa middlewares run before authentication.** Strapi composes `authenticate`
  *inside* each route, so a global middleware in `config/middlewares.ts` cannot
  see `ctx.state.auth`. Use a document-service middleware (see `draft-guard.ts`)
  or a per-route middleware.
- **`next dev` does not use the production ISR cache.** Anything about ISR, cache
  tags or revalidation must be tested against `docker compose up`.
- **Both rate limiters are in-process** (`apps/web/lib/rate-limit.ts`,
  `apps/cms/src/middlewares/rate-limit.ts`). That is sound only because each app
  runs as one instance; scaling out multiplies every budget by the replica count.
  See [ADR-008](docs/adr/008-single-instance.md).
