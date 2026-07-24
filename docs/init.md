# ROLE

You are a senior full-stack architect. Your ONLY deliverable in this task is a
detailed PLAN — architecture, decisions, folder structure, rendering/caching
strategy, CI/CD, and a phased roadmap. Do NOT write full application code yet.
Ask clarifying questions only if a decision is genuinely blocking; otherwise choose
sensible defaults and state each assumption explicitly.

# PROJECT

Build a monorepo, headless CMS-driven website platform:

- Backend / CMS: Strapi 5 (Community edition), headless.
- Frontend: Next.js 16 (App Router, React Server Components, React 19).
- Goal: a CMS where non-technical users create blog posts AND landing pages with
  the highest possible customization via a component/block-based page builder
  (Strapi dynamic zones + reusable components), with first-class SEO.
  The platform must be genuinely optimized, clean, easy to maintain, and scalable.

# FIXED ENVIRONMENT & TOOLING (hard constraints)

- Runtime: Node.js 24
- Database: PostgreSQL 17
- Package manager: pnpm 10 (latest), pnpm workspaces
- Monorepo orchestration: Turborepo (remote caching enabled)
- Code quality: Biome (single tool for lint + format — replaces ESLint + Prettier)
- Git hooks: Lefthook (pre-commit: biome check + typecheck; commit-msg: conventional commits)
- Containerization: Docker for both apps
- Cloud / CDN: AWS. Assume CloudFront + S3 for static assets & media (S3 as the
  Strapi upload provider). Choose and justify AWS compute for each app
  (e.g. ECS Fargate / App Runner) and RDS PostgreSQL 17 for the database.
- Use the latest STABLE versions of all packages; pin versions and justify every
  major dependency in a version table.

# REFERENCE STARTER (adapt, don't copy blindly)

Base the structure on: https://github.com/notum-cz/strapi-next-monorepo-starter
It is an enterprise-ready Strapi v5 + Next.js 16 + Turborepo + pnpm monorepo with a
typed page builder, smart population, page hierarchy, redirects, generated TS API
types, shared design system, auth, localization, preview, SEO helpers, media
handling, browser-safe Strapi proxying, seed data, Docusaurus docs, Playwright QA,
Docker, and an AI-agent layer (.agents/, .claude/skills/, AGENTS.md, CLAUDE.md,
skills-lock.json). Because our stack is already Strapi 5 + Next.js 16, reuse it
heavily. The only required deviation: replace ESLint + Prettier with Biome (keep
Lefthook + conventional commits). Preserve its proven patterns: typed API client,
smart population, preview/draft mode, SEO helpers, seed data, Docusaurus docs,
Playwright QA, worktrees.

# RENDERING & CONTENT-SYNC STRATEGY (critical hard requirement)

- Content changes in the CMS MUST reflect on the frontend IMMEDIATELY — with NO
  waiting for a full rebuild. The catalog may grow to THOUSANDS of articles, so
  full SSG of all content pages is explicitly FORBIDDEN (build explosion).
- Use Next.js ISR + on-demand revalidation (App Router). Serve statically-cached
  pages using stale-while-revalidate, and refresh individual entries on demand.
- Truly-static, rarely-changing pages (homepage shell, /about, legal, marketing
  landings that change rarely) may be prerendered/cached with long lifetimes.
- All CMS-data-driven pages (article list, article detail [slug], dynamic landing
  pages, category/tag pages) use tagged caching so they can be invalidated per entry.
- Define a cache-tag scheme mapping Strapi entries → tags (e.g. article:{id},
  landing:{slug}, list:articles). Tag fetches with next: { tags: [...] } (or the
  use cache / cacheTag / cacheLife model) and set sensible cacheLife profiles.
- FRESHNESS MECHANISM (specify concretely): Strapi lifecycle/webhook on
  publish / update / unpublish → POST to a Next.js Route Handler → call
  revalidateTag() (and/or revalidatePath()) for the exact affected tags/paths.
  Result: a single entry updates instantly, with ZERO rebuild and ZERO redeploy.
- Add a short time-based revalidation as a safety net for missed webhooks.
- Note: ISR requires the Node.js runtime (not static export); design AWS compute
  accordingly. Address multi-instance cache consistency (e.g. shared cache handler /
  Redis) if running more than one instance.
- Clearly distinguish: CONTENT change = cache revalidation (instant, no build);
  CODE change = CI/CD build + deploy of the affected app(s).

# STRAPI STRATEGY

- Prefer Strapi 5 built-ins: Content-Type Builder, dynamic zones, i18n, RBAC,
  draft & publish, scheduled publishing, media library, S3 upload provider.
- Where built-ins fall short, decide clearly between (a) config, (b) custom
  controllers/services/routes, or (c) a custom Strapi plugin — give a rule of thumb
  for WHEN to build a plugin vs. inline custom code.
- Design a reusable, typed "page builder" content model for landing pages and blog
  posts (flexible blocks/components via dynamic zones). Generate shared TypeScript
  types consumed by the Next.js app. Include smart population strategy.

# SEO (first-class)

- Meta tags, Open Graph, JSON-LD structured data, sitemap.xml, robots.txt, canonical
  URLs, i18n hreflang, redirects, draft/preview mode, scheduled publishing.
- Explain how SEO metadata is modeled in Strapi and rendered via Next.js Metadata API.

# UI / DESIGN SYSTEM (decision required)

- Choose ONE base component system and justify it (do NOT run two overlapping systems):
  - Option A — Astryx (Meta's open-source React/StyleX design system): 150+ accessible
    components, token-based theming with multiple built-in themes + dark mode, MIT,
    and crucially an AI-agent-native CLI + MCP server (humans and agents share one API).
    Best fit for our AI-agent goals and theming needs, but currently BETA and StyleX
    has a steeper learning curve. React ≥ 19 peer dep; works with Next.js.
  - Option B — shadcn/ui + Tailwind CSS v4 + Radix primitives: matches the reference
    starter directly, huge ecosystem, you own the source, lowest risk.
- Recommend one as PRIMARY (lean Astryx if AI-agent ergonomics + multi-theme are the
  top priority and beta risk is acceptable; otherwise shadcn/ui). State the fallback.
- Companion libraries (one per role, prefer tree-shakable / low-JS, add only when needed):
  - Animation: Motion (subtle, modern, whileInView for scroll) — respect prefers-reduced-motion
  - i18n: next-intl (App Router)
  - Forms + validation: React Hook Form + Zod (share schemas FE ↔ content validation)
  - Icons: lucide-react
  - Admin/data tables: TanStack Table
  - Strapi content rendering: blocks-react-renderer (or equivalent) for dynamic-zone blocks
  - Optional as needed: sonner (toasts), cmdk (command menu), embla-carousel, vaul (drawer)
  - Theme toggle: next-themes ONLY if the shadcn/ui path is chosen (Astryx has its own theming)
- Visual direction: solid minimalism — clean, high-contrast, spacious, confident.
  Clear design tokens (color, spacing, typography scale), light/dark mode + multiple
  themes, multi-language, subtle lightweight animations.

# PERFORMANCE (Lighthouse obsession)

- Target 95–100 across Performance, SEO, Accessibility, Best Practices.
- Explain concrete techniques: minimal client JS (RSC, selective 'use client'),
  image optimization, streaming/Suspense, CDN edge caching + high cache-hit ratio,
  font strategy, and how ISR + tagged caching keeps dynamic pages fast.

# MONOREPO STRUCTURE

- Define the tree: apps/ (web = Next.js, cms = Strapi), packages/ (design-system,
  shared TS types + typed API client, biome/tsconfig presets), plus .agents/,
  .claude/, docs/ (Docusaurus), qa/ (Playwright), scripts/.
- Root config: pnpm-workspace.yaml, turbo.json, biome.json, lefthook.yml,
  commitlint config, .nvmrc (Node 24), Dockerfiles, .env strategy per app/env.

# AI / AGENT ENABLEMENT (important)

- Design "skill / rule / docs" files so AI coding agents work effectively:
  root AGENTS.md + CLAUDE.md, per-app agent notes, .claude/skills/ entries, a
  skills-lock.json, and a /docs (Docusaurus) folder with ADRs plus task recipes:
  "how to add a content type", "how to add a page-builder block", "how to add a
  theme", "how to add a language", "how to wire a revalidation webhook".
- Specify each file's exact purpose and location so an agent can navigate with
  minimal context loss. If Astryx is chosen, note how its MCP server/CLI plugs in.

# DEPLOYMENT & CI/CD (needs a clear, flexible flow)

- Two deploy targets: (1) Next.js frontend (Node runtime for ISR), (2) Strapi backend.
- AWS topology: Next.js Docker image → ECS Fargate/App Runner behind CloudFront
  (CloudFront caches responses; static assets + media on S3). Strapi Docker image →
  ECS Fargate/App Runner, RDS PostgreSQL 17, S3 uploads.
- CI/CD pipeline DETECTS changed paths (Turborepo affected + GitHub Actions path
  filters) and flexibly runs FE only, BE only, or BOTH. Cover: remote build cache,
  env separation (dev/staging/prod), secrets management, Strapi DB migrations,
  and rollback strategy.
- Provide a CONCRETE GitHub Actions example implementing the change-detection logic
  that decides which app(s) to build & deploy.
- Reiterate the content vs. code distinction (content = webhook→revalidate, no deploy).

# OUTPUT FORMAT

Deliver the plan in this order (prefer tables + short justifications over long prose):

1. Key architecture decisions & trade-offs (with chosen defaults)
2. UI base recommendation (Astryx vs shadcn/ui) with justification + final companion stack
3. Monorepo folder structure (tree view)
4. Strapi content model + page-builder design + plugin/custom-code strategy
5. Rendering & content-sync design (ISR, cache tags, webhook → revalidate flow)
6. Design system / theming / i18n / SEO / performance plan
7. AI/agent docs & rule files plan (files + purpose)
8. AWS deployment topology + CI/CD change-detection flow + example pipeline
9. Phased roadmap (ordered milestones with a definition of done per phase)
10. Risks, open questions, and a version-pinning table

Be precise, opinionated, and actionable.
