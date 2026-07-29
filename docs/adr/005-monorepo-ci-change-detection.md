# ADR-005 — Monorepo topology + change-detection CI

- **Status:** Accepted
- **Date:** 2026-07 (P0/P6); CI platform revised to GitLab
- **Relates to:** plan §1, §3, §8.3, §5.4

## Context

Two deployable apps (`web`, `cms`) share types, a design system and the cache-tag
scheme. They deploy independently — a copy tweak to a React component must not
redeploy Strapi, and a content-type change must not rebuild the frontend.

But they are *coupled through the shared packages*: `@vng/shared` carries the content
types, the typed client and the cache tags that both sides must agree on. A change
there can break either app.

## Options

### Separate repositories

- Independent versioning and CI, no shared-package build ordering.
- But the shared contracts would have to be *published* to be consumed, so every
  content-type change becomes: bump `@vng/shared`, publish, update two consumers,
  reconcile. That is days of latency on a change that should take minutes, and it
  invites version skew where the FE and CMS disagree about a cache tag — the exact
  failure [ADR-001](001-rendering-strategy.md) says is hardest to detect.

### Monorepo, build everything on every push

- Simple and always correct.
- Wasteful: a docs edit rebuilds two Docker images. Slow feedback erodes the habit of
  small commits, and on a fixed timeline that compounds.

### Monorepo + change detection (chosen)

pnpm workspaces for the dependency graph, Turborepo for task orchestration and
caching, and CI jobs gated on path filters.

## Decision

**pnpm 10 workspaces + Turborepo 2**, with CI building only the affected app(s).

```
apps/web            apps/cms
packages/shared     packages/design-system
packages/config-biome  packages/config-tsconfig
qa/                 docs/                 infra/
```

Change detection (`.gitlab-ci.yml`), with the important asymmetry spelled out:

| Changed | Builds |
|---|---|
| `apps/web/**` | web |
| `apps/cms/**` | cms |
| `packages/**` | **both** |
| `qa/**`, `docs/**`, CI config | neither |

`packages/**` builds **both** because `@vng/shared` and `@vng/design-system` are
compiled into both images. Building only one would let them drift — and drift in the
cache-tag scheme is silent staleness, not a test failure. This rule is the reason
change detection is safe here.

Supporting choices:

- **Biome** replaces ESLint + Prettier (mandated). One tool, one config, and fast
  enough that `pnpm lint` is not something people skip.
- **Lefthook** for pre-commit and commit-msg; **commitlint** for Conventional Commits.
- `turbo.json` declares `inputs`/`outputs` per task so the remote cache is actually
  effective; `test` and `typecheck` depend on `^build` because `@vng/shared` must be
  compiled before the CMS can consume its CJS bundle.
- **Turborepo remote cache: self-hosted on S3**, resolving §10.2 Q3 — the constraint is
  "all AWS", and a Vercel-hosted cache would put a third-party dependency in the build
  path for no functional gain.

### Content never touches CI

Restating §5.4 because it is what the pipeline design protects: the pipeline builds
and deploys **code**. Publishing content bypasses it entirely — webhook →
`revalidateTag` → fresh. If a content operation ever appears to need a pipeline run,
the cache-tag wiring is wrong.

### CI platform

Originally specified as GitHub Actions (§8.3); migrated to **GitLab CI**
(`.gitlab-ci.yml`) to match VNG's internal tooling. The `workflow:rules` block exists
to avoid GitLab's duplicate-pipeline trap, where a branch push and its merge request
each start a pipeline for the same commit.

## Consequences

- `@vng/shared` is **dual-built** — TS source for the web app's bundler, compiled CJS
  for the Strapi runtime — which is a recurring source of confusion. It is documented
  in both app CLAUDE.md files and in AGENTS.md's gotchas, and the symptom is always
  the same: the CMS is using a stale copy because `pnpm --filter @vng/shared build`
  was not run.
- Path filters must be maintained. A new deployable app needs a new job and a new
  filter, or it silently never builds.
- The pipeline currently builds images to prove the Dockerfiles are correct and does
  not push them; ECR push + the ECS deploy/migration gate is the P6 work
  (`deploy-app` reusable job).

## Revisit if

- A third deployable app appears and path filters start to feel like duplication — at
  that point drive job selection from `turbo run --filter='...[origin/main]'` output
  rather than hand-written filters.
- The team consolidates on a different CI platform again.
