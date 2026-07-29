# VNG Platform — Phase-by-Phase Build Guide (Agent Prompts + Model Picks)

Companion to [architecture_plan.md](architecture_plan.md). For each phase: **goal → recommended model (why) → copy-paste English prompt → done when**.

## How to use this
- Run phases **in order** (P0 → P7). Each prompt assumes the previous phase is merged.
- Start every agent session by pointing it at the plan: *"Read `docs/architecture_plan.md` and `docs/phase_guide.md` first."*
- Work on a branch per phase; open a PR; let CI (from P0) gate it.
- Prompts are written for a Claude Code / agent that can edit files and run commands.

## Model cheat-sheet (Claude family, mid-2026)

| Model | Use it for | In this guide |
|---|---|---|
| **Opus 4.8** | Deep reasoning, architecture, tricky wiring, security | P0, P3, P4, P6, P7 |
| **Sonnet 5** | Solid feature implementation from a clear spec | P1, P2, P5 |
| **Haiku 4.5** | Cheap mechanical/repetitive edits, boilerplate | sub-tasks (seed data, adding Nth block, renames) |

Rule of thumb: **reason with Opus, build with Sonnet, grind with Haiku.** Escalate to Opus the moment an agent gets stuck or the change spans many interacting systems.

---

## P0 — Foundation & Tooling
**Goal:** Bootable monorepo skeleton with all tooling + CI. **Model: Opus 4.8** (many interacting configs; getting Turbo/Biome/Lefthook/CI right upfront pays off all project long).

```text
Read docs/architecture_plan.md (sections 3, 8) first. Scaffold the monorepo skeleton
ONLY — no app features yet.

Create:
- pnpm workspaces (pnpm-workspace.yaml) + Turborepo (turbo.json with lint/typecheck/
  test/build pipelines, correct inputs/outputs for remote caching).
- Biome (biome.json in packages/config-biome) as the ONLY linter+formatter — do NOT
  add ESLint or Prettier.
- Lefthook (lefthook.yml): pre-commit = biome check + typecheck; commit-msg =
  conventional commits (commitlint.config.ts).
- .nvmrc = 24, root tsconfig presets in packages/config-tsconfig.
- Empty apps/web (Next.js 16 App Router, React 19, TypeScript strict) and apps/cms
  (Strapi 5 Community, TypeScript) that each boot with a placeholder page/admin.
- packages/shared and packages/design-system as empty typed workspace packages.
- docker-compose.yml: postgres:17, redis, cms, web — `docker compose up` must boot all.
- .github/workflows/ci.yml with the change-detection + Turbo affected pattern from
  section 8.3 (quality job runs lint/typecheck/build on affected only).

Pin exact latest-stable versions and record them. Do NOT implement content types,
pages, or business logic. 

Done when: `pnpm install` + `pnpm turbo run build` succeed, `docker compose up` boots
web+cms+pg+redis, a dummy commit triggers Lefthook hooks, and CI passes on a PR.
```

---

## P1 — CMS Core (content model + page builder)
**Goal:** Strapi content types, blocks, SEO, i18n, generated types. **Model: Sonnet 5** (clear spec in plan §4; use Haiku for repetitive block/seed creation).

```text
Read docs/architecture_plan.md section 4 first. In apps/cms build the content model.

Create content types: article, landing-page, page, category, tag, author, redirect,
navigation, and a `global` single type — with i18n (vi/en) and Draft & Publish +
scheduled publishing enabled where section 4.1 specifies.

Build the page-builder dynamic zone `blocks` with these reusable components: hero,
rich-text, media, image-gallery, cta, feature-grid, stats, logo-cloud, timeline,
leadership-grid, faq, testimonial, embed, article-carousel, contact-form.

Add the shared SEO component (metaTitle, metaDescription, canonicalURL, ogImage,
noindex, structuredData, keywords) to article/landing-page/page.

Configure the S3 upload provider (config only; real bucket wired later) and i18n
locales vi+en. Implement the smart-population config (section 4.4) as the single
source of truth. Generate TypeScript types and export them from packages/shared.
Add seed data (a few articles, one landing page, navigation, global).

Do NOT build the editorial workflow/audit plugin yet (that's P4).

Done when: admin shows all types + blocks, seed data loads, generated TS types build
in packages/shared, and list vs detail endpoints populate per section 4.4.
```

---

## P2 — Frontend Rendering (typed client + block registry)
**Goal:** Render all content from CMS via ISR. **Model: Sonnet 5** (implementation from types).

```text
Read docs/architecture_plan.md sections 4.4 and 5 first. In apps/web render content
from Strapi using RSC-first App Router.

Build:
- A typed API client in packages/shared consuming the generated Strapi types, with
  the smart-population config.
- Routes: [locale] segment (next-intl vi/en), tin-tuc list + tin-tuc/[slug] detail,
  dynamic landing [...slug], category/[slug], tag/[slug].
- A typed block registry (blockType -> React component) that renders every P1 block;
  add Zod schemas per block in packages/shared.
- Static shell routes ((marketing): home shell, about, legal) prerendered.
- Tag every CMS fetch with next:{tags:[...]} per the section 5.2 scheme
  (article:{id}, list:articles, landing:{slug}, navigation:{locale}, global) and set
  cacheLife profiles (static/content/list). Add time-based safety-net revalidation.

Keep client JS minimal — 'use client' only for interactive islands. Do NOT implement
the webhook receiver yet (P3).

Done when: article list/detail, dynamic landing, category/tag all render from CMS
seed data; all P1 blocks render via the registry; fetches carry correct cache tags.
```

---

## P3 — Freshness (webhook → revalidate, cluster-wide)
**Goal:** Instant content updates, no rebuild, consistent across instances. **Model: Opus 4.8** (distributed-cache correctness is subtle and easy to get wrong).

```text
Read docs/architecture_plan.md sections 5.2, 5.3, 5.4 first. Implement instant content
freshness with zero rebuild.

Build:
- apps/cms: lifecycle hooks (afterCreate/afterUpdate/afterDelete + publish/unpublish)
  that POST {model,id,slug,locale} to the web app's /api/revalidate, signed with an
  HMAC shared secret. Add retry on failure.
- apps/web: app/api/revalidate/route.ts that verifies the HMAC, maps the entry to the
  exact cache tags (section 5.2 table), calls revalidateTag()/revalidatePath(), is
  idempotent, and logs.
- apps/web/cache-handler.mjs: a custom Next.js cacheHandler backed by Redis
  (@neshca/cache-handler or equivalent), wired in next.config.ts, so revalidateTag
  clears the cache cluster-wide (not just the instance that got the webhook).

Verify multi-instance behavior with the docker-compose (run web with 2 replicas +
shared redis). Prove: publishing an article in CMS makes the change visible on the FE
in under ~2s WITHOUT any rebuild/redeploy, on both replicas.

Done when: publish/update/unpublish reflects on FE < ~2s across 2 web instances, HMAC
verification rejects unsigned calls, and the safety-net revalidation still works if a
webhook is dropped.
```

---

## P4 — SEO/AIO + Editorial Workflow + Audit
**Goal:** First-class SEO + editorial governance. **Model: Opus 4.8** (custom plugin with own tables + RBAC + immutable audit = correctness/security sensitive).

```text
Read docs/architecture_plan.md sections 4.5, 4.6, 6.3 first, and master_summary.md
section 5 (SEO/AIO backlog).

SEO in apps/web:
- generateMetadata() from the Strapi SEO component (title/description/OG/canonical).
- JSON-LD: Organization (home), NewsArticle (articles), BreadcrumbList (path-derived),
  FAQPage (faq blocks).
- Dynamic app/sitemap.ts (canonical URLs only), app/robots.ts honoring noindex flags,
  hreflang alternates for vi/en.
- 301 redirect resolution from the `redirect` content type (middleware), including a
  CSV importer for the 297 legacy 404 URLs.
- Draft/preview mode route using a Strapi preview token.

Editorial + audit in apps/cms (build as a CUSTOM PLUGIN per the section 4.6 rule):
- contentStatus enum (draft|review|approved|published|archived) + a transition service
  enforcing legal transitions, recording who/when/reason.
- RBAC roles (Master Admin, Admin, Editor, Contributor, Viewer) mapped to allowed
  transitions.
- Immutable audit log (own DB table) for create/update/delete/approve/publish/rollback,
  not deletable by normal users; filterable + exportable; soft-delete (trash).

Done when: Rich Results Test passes for Org/NewsArticle/Breadcrumb/FAQ; sitemap/robots/
hreflang correct; 301s resolve; a non-Approver cannot approve; audit entries are
immutable and exportable.
```

---

## P5 — Design System + A11y + Performance
**Goal:** Solid-minimalism UI hitting Lighthouse 95–100. **Model: Sonnet 5** (component build; invoke the `dataviz` skill for any charts/stat tiles).

```text
Read docs/architecture_plan.md sections 2 and 6 first.

In packages/design-system build the shadcn/ui + Tailwind v4 + Radix design system:
- Design tokens as CSS variables (color, spacing, typography scale); solid-minimalism
  (high-contrast, spacious). Light/dark + at least one extra named theme via
  next-themes.
- Restyle the P2 blocks to use the design system. Add Motion animations (whileInView,
  subtle) that respect prefers-reduced-motion. Icons via lucide-react. Forms via React
  Hook Form + Zod (reuse the P2 block schemas).
- Self-hosted next/font with display:swap and a preloaded Vietnamese-diacritics subset.
- next/image everywhere (WebP/AVIF, responsive sizes, priority on LCP image).
- Streaming + Suspense with skeletons for below-the-fold blocks.

Add Lighthouse CI to qa/ with budgets: LCP<2.5s, INP<200ms, CLS<0.1, and scores >=95
on Performance/SEO/Accessibility/Best-Practices — wire it as a CI gate.

Done when: all pages use the design system with working light/dark/theme switching,
Playwright e2e passes, and Lighthouse CI is green (>=95 all four categories).
```

---

## P6 — AWS Infrastructure + CI/CD
**Goal:** Reproducible infra + change-detecting deploy. **Model: Opus 4.8** (IaC + migrations + rollback + blue-green must be correct and safe).

```text
Read docs/architecture_plan.md section 8 first.

Write Terraform for dev/staging/prod (workspaces): VPC, ECS Fargate services for web
(2 tasks) and cms (2 tasks), RDS PostgreSQL 17 Multi-AZ, ElastiCache Redis (for the ISR
cache handler), S3 (assets + Strapi uploads), CloudFront in front of web + S3, ECR,
Secrets Manager (DB creds, webhook HMAC, S3 keys injected as ECS task secrets), ALBs.

Write Dockerfiles for apps/web (Node runtime for ISR — NOT static export) and apps/cms.

Extend .github/workflows: a reusable deploy-app.yml that builds+pushes to ECR, runs
Strapi DB migrations as a one-off ECS task BEFORE the new task set takes traffic (cms
only, forward-only migrations, snapshot first), then does a blue-green ECS deploy with
health checks and auto-rollback to the previous task-def on failure. Wire ci.yml so the
change-detection outputs deploy web-only / cms-only / both; packages/** forces both.

Reiterate in code + comments: content changes never touch this pipeline (webhook →
revalidate only).

Done when: `terraform apply` stands up staging; a web-only change deploys only web; a
cms change runs migrations then deploys cms; a forced failed deploy auto-rolls back.
```

---

## P7 — Hardening, Security Review, UAT, Docs
**Goal:** Launch-ready. **Model: Opus 4.8** (security review + threat reasoning). Consider the `/security-review` skill.

```text
Read the whole docs/architecture_plan.md, then harden for production launch.

Security: verify protections against XSS/CSRF/SQL-injection, add API auth + rate
limiting, session timeout on the Strapi admin, and secure headers/CSP on web. Wire
SSO/MFA for the CMS admin via VNG's IdP (default OIDC — confirm protocol). Add the S3
upload virus-scan hook (lifecycle → Lambda/ClamAV).

Quality: finalize Playwright e2e for critical journeys, confirm Lighthouse budgets hold
on staging, load-test the revalidate path.

Docs & agent enablement (section 7): complete AGENTS.md, CLAUDE.md, per-app CLAUDE.md,
the five .claude/skills recipes (add-content-type, add-page-builder-block, add-theme,
add-language, wire-revalidation-webhook), skills-lock.json, and Docusaurus ADRs
001–005.

Run a full security review of the pending changes and fix findings.

Done when: security review passes with no high/critical findings, SSO/MFA + virus scan
work, docs/ADRs/recipes are complete, and the platform is ready for soft launch.
```

---

## Quick reference

| Phase | Focus | Model | Escalate to Opus if… |
|---|---|---|---|
| P0 | Monorepo + tooling + CI | **Opus 4.8** | — |
| P1 | CMS content model + blocks | Sonnet 5 (Haiku for Nth block/seed) | population/types get tangled |
| P2 | FE rendering + typed client | Sonnet 5 | cache-tag wiring confuses the agent |
| P3 | Webhook → revalidate + Redis cache | **Opus 4.8** | — |
| P4 | SEO/AIO + workflow + audit plugin | **Opus 4.8** | — |
| P5 | Design system + a11y + perf | Sonnet 5 | Lighthouse won't hit 95 |
| P6 | AWS Terraform + CI/CD | **Opus 4.8** | — |
| P7 | Security + UAT + docs | **Opus 4.8** | — |

**One-liner to start any phase:** *"Read `docs/architecture_plan.md` and `docs/phase_guide.md`, then execute Phase PX exactly as its prompt specifies. Ask before deviating from the pinned stack. Stop at the phase's 'Done when' and open a PR."*
