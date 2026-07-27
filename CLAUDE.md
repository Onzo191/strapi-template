# new-vng — agent guide

VNG content/marketing site. Turborepo + pnpm. **Web:** Next 16 (App Router, RSC),
next-intl, Tailwind v4. **CMS:** Strapi 5. Packages: `@vng/design-system` (shadcn/ui),
`@vng/shared` (dual-build contracts), `config-*`.

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
| Cache revalidation, webhooks, redis, freshness | `content-freshness` |
| Playwright e2e, Lighthouse | `qa-e2e` |

Deep background (requirements, architecture, phases) lives in `docs/`. Skills link the
relevant one — read it only when the skill tells you to.

## Hard rules (always apply)

- **Package manager is pnpm** (workspaces). Never `npm`/`yarn`.
- **Lint/format is Biome**, not ESLint/Prettier. Run `pnpm lint` / `pnpm typecheck`.
- **Import UI from `@vng/design-system`**, cross-app contracts from `@vng/shared`. Don't
  re-implement primitives locally.
- Server Components by default; add `"use client"` only when a component needs
  interactivity or browser APIs.
- Don't commit or push unless asked. Commit style: Conventional Commits (commitlint).
