# Pinned Versions

All versions are pinned **exact** (no `^`/`~`) for reproducibility, resolved to the
latest stable at scaffold time (2026-07-24). Major bumps must go through an ADR
(architecture_plan.md §10.1).

## Toolchain / runtime

| Tool | Pinned | Notes |
|---|---|---|
| Node.js | 24 (`.nvmrc`) | Runtime 24.16.0 verified locally |
| pnpm | 10.34.4 | `packageManager` field |
| Turborepo | 2.10.6 | `tasks` schema, remote-cache ready |
| Biome | 2.5.5 | **Only** linter + formatter (no ESLint/Prettier) |
| Lefthook | 2.1.10 | Git hooks |
| commitlint | 21.2.1 / config-conventional 21.2.0 / types 21.2.0 | commit-msg |
| TypeScript | 5.9.3 | See deviation note below |

## apps/web (Next.js)

| Package | Pinned |
|---|---|
| next | 16.2.11 |
| react / react-dom | 19.2.8 |
| @types/react / @types/react-dom | 19.2.17 / 19.2.3 |
| @types/node | 24.13.3 |

## apps/cms (Strapi 5 CE)

| Package | Pinned |
|---|---|
| @strapi/strapi | 5.51.0 |
| @strapi/plugin-users-permissions | 5.51.0 |
| @strapi/plugin-cloud | 5.51.0 |
| react / react-dom | 18.3.1 |
| react-router-dom | 6.30.4 |
| styled-components | 6.4.4 |
| pg | 8.22.0 |
| @types/react / @types/react-dom | 18.3.31 / 18.3.7 |

## Infrastructure images

| Image | Pinned |
|---|---|
| postgres | 17 |
| redis | 7-alpine |
| node (Docker base) | 24-slim |

## Deviations from the plan's §10.3 pin table (and why)

- **TypeScript 5.9.3, not the registry-latest 7.x.** TypeScript 7 is the native
  (Go) compiler rewrite; the Strapi 5 and Next.js 16 toolchains do not yet
  officially support it. §10.3 pins TypeScript to the 5.x line — followed here for
  a build that actually compiles.
- **React split by app:** web on React **19** (plan requirement, RSC); cms on React
  **18.3.1** because the Strapi 5 admin peer-depends on React 17/18. Forcing React
  19 into the admin breaks its build.
- **Lefthook 2.1.10** (plan §10.3 said 1.x). Latest stable is 2.x; config format is
  compatible, so pinned to latest stable per the scaffold brief.

## Deferred (NOT installed in the skeleton — arrive in later phases)

next-intl, Tailwind CSS v4, shadcn/Radix, Motion, React Hook Form, Zod, next-themes,
lucide-react, TanStack Table, `@neshca/cache-handler`, `@strapi/provider-upload-aws-s3`,
Playwright, Docusaurus. These belong to P1/P2/P3/P5 per the roadmap (§9) and are
intentionally absent to keep the skeleton minimal.
