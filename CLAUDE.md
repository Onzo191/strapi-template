# new-vng — agent guide

VNG content/marketing site. Turborepo + pnpm. **Web:** Next 16 (App Router, RSC),
next-intl, Tailwind v4. **CMS:** Strapi 5 (Community). Packages:
`@vng/design-system` (shadcn/ui), `@vng/shared` (dual-build contracts), `config-*`.

Broader orientation — what the product is, the folder map, the "do/don't" list and
the security invariants — is in [AGENTS.md](AGENTS.md). This file is the
Claude-specific layer: commands, package boundaries, safety notes.

## How to use this guide (routing)

Do **not** read every doc up front. This file + the skill index are the only things
always in context. When a task matches a domain below, invoke that skill — it loads the
detailed conventions and points to the heavy `docs/*.md` on demand. This keeps context
small and fast.

| Task touches… | Invoke skill |
|---|---|
| UI components, CMS blocks, styling, tokens, motion | `design-system` |
| Strapi content-types, schemas, seed, plugins | `cms-strapi` |
| `<head>` metadata, JSON-LD, sitemap, hreflang, redirects | `seo-aio` |
| Locale routing, `messages/*.json`, translations | `i18n-routing` |
| Cache revalidation, webhooks, ISR, freshness | `content-freshness` |
| Playwright e2e, Lighthouse | `qa-e2e` |
| Auth, CSP, rate limits, SSO, secrets, uploads | `security` |

Step-by-step recipes for the five most common changes live in
`.claude/skills/{add-content-type,add-page-builder-block,add-theme,add-language,wire-revalidation-webhook}`.

Deep background (requirements, architecture, phases) lives in `docs/`; the *why*
behind the load-bearing decisions is in `docs/adr/`. Skills link the relevant one —
read it only when the skill tells you to.

## Commands

```bash
pnpm install                     # never npm/yarn
pnpm lint                        # Biome (check)      pnpm lint:fix
pnpm typecheck                   # tsc --noEmit across the graph
pnpm test                        # node:test unit tests
pnpm build                       # turbo, affected only

docker compose up                # postgres + cms + web (the real stack)
pnpm --filter @vng/qa e2e        # Playwright
pnpm --filter @vng/qa lighthouse # Lighthouse budgets
pnpm --filter @vng/qa load:revalidate   # revalidate-path load test
```

Run `pnpm lint && pnpm typecheck` before declaring work finished — both are fast
(<1s and a few seconds respectively), and Biome's formatter will otherwise fail CI
on whitespace alone.

## Package boundaries

| Package | Consumed by | Notes |
|---|---|---|
| `@vng/design-system` | web only | shadcn/ui + Radix + CVA + Tailwind v4. Client-safe. |
| `@vng/shared` | web **and** cms | **Dual-built.** Web bundles `src/*.ts`; Strapi `require`s `dist/index.cjs`. Keep the barrel free of `next`/React/DOM imports, and run `pnpm --filter @vng/shared build` after editing it or the CMS uses a stale copy. |
| `@vng/config-biome`, `@vng/config-tsconfig` | everything | Presets only. |

`@vng/shared` is where cross-cutting contracts belong: content types, the typed
Strapi client, the cache-tag scheme, Zod block schemas, and the security helpers
(`safeHref`, `safeFrameSrc`, `toCsv`, the signed-webhook envelope).

## Safety notes

- **Never weaken a security invariant to make something work.** The seven
  invariants in [AGENTS.md](AGENTS.md#security-invariants) are enforced in code and
  covered by tests; if one blocks you, the design needs changing, not the guard.
  Reasoning is in [docs/adr/006-security-hardening.md](docs/adr/006-security-hardening.md).
- **Don't touch `.env` files.** Add new variables to `.env.example` (documented,
  with the safe default) and to `docker-compose.yml`. Real values live in AWS
  Secrets Manager.
- **Don't run destructive Strapi commands** (`strapi ts:generate-types --force`,
  data-transfer imports, `docker compose down -v`) without being asked — the local
  Postgres volume holds the only copy of whatever the developer was working on.
- **`docker compose up` is the only faithful local stack.** `next dev` does not use
  the production ISR cache, so nothing about ISR, cache tags or revalidation can be
  validated with it. Stateful services are in `docker-compose.infra.yml`.
- **One instance of each app** ([ADR-008](docs/adr/008-single-instance.md)). The ISR
  cache and both rate limiters are per-process; adding a replica silently breaks
  content freshness. Don't add one without reading that ADR.
- **Content changes never require a deploy.** If a change seems to need a rebuild
  to make content appear, the cache-tag wiring is wrong — fix that instead.
- Don't commit or push unless asked. Commit style: Conventional Commits (commitlint).

## CI

`.gitlab-ci.yml` builds the `web` and `cms` Docker images (`apps/web/Dockerfile`,
`apps/cms/Dockerfile`; build context is the repo root). Each build job is gated on
`rules: changes:` so a push only builds the app(s) actually affected — `packages/**`
changes build both, since `@vng/shared` and `@vng/design-system` feed both apps.
