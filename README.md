# VNG Platform

Monorepo for the VNG website revamp — **Strapi 5** (headless CMS) + **Next.js 16**
(App Router / RSC). This repository is currently the **P0 skeleton**: tooling and
boot only, no content types, pages, or business logic. See
[docs/architecture_plan.md](docs/architecture_plan.md).

## Layout

```
apps/
  web/                Next.js 16 · App Router · React 19 (placeholder page)
  cms/                Strapi 5 CE · TypeScript (boots to admin)
packages/
  shared/             typed shared package (empty)
  design-system/      shadcn/tokens package (empty)
  config-biome/       Biome preset (the only linter + formatter)
  config-tsconfig/    base / nextjs / react-library / strapi tsconfig presets
```

## Prerequisites

- Node.js 24 (`nvm use`)
- pnpm 10 (`corepack enable`)
- Docker (for the local stack)

## Common tasks

```bash
pnpm install                 # install workspace
pnpm turbo run build         # build all apps (Turbo affected graph in CI)
pnpm lint                    # Biome check
pnpm typecheck               # tsc --noEmit across packages
docker compose up            # boot postgres17 + redis + cms + web
```

- web → http://localhost:3000
- cms admin → http://localhost:1337/admin

## Conventions

- **Biome** is the only linter/formatter — no ESLint, no Prettier.
- Commits follow **Conventional Commits** (enforced by Lefthook `commit-msg`).
- `pre-commit` runs Biome + affected typecheck.
- Pinned versions live in [VERSIONS.md](VERSIONS.md); bumps go through an ADR.
