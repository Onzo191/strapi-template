---
slug: /
title: VNG Platform handbook
sidebar_label: Overview
sidebar_position: 0
---

# VNG Platform handbook

Engineering documentation for **vng.com.vn** — the CMS-driven, bilingual corporate site
built on Strapi 5 (Community) + Next.js 16.

This site is the *human* half of the documentation. Its counterpart lives in the
repository: `AGENTS.md` is the root map for coding agents, and `.claude/skills/` holds
the step-by-step recipes (add a content type, add a page-builder block, add a theme, add
a language, wire the revalidation webhook). Those are deliberately **not** duplicated
here — a recipe that exists in two places drifts, and the copy that drifts is always the
one somebody follows.

## Start here

**[Architecture Decision Records](/adr/)** — the load-bearing decisions and, more
usefully, what would make us revisit each one. Read the relevant ADR *before*
overturning the decision it records.

| # | Decision |
|---|---|
| [001](/adr/rendering-strategy) | Rendering: ISR + cache tags, not SSG or SSR |
| [002](/adr/ui-base) | UI base: shadcn/ui + Tailwind v4, Astryx deferred |
| [003](/adr/redis-cache-handler) | Redis-backed Next cache handler — mandatory, not optional |
| [004](/adr/editorial-workflow-on-ce) | Editorial workflow + immutable audit on Community edition |
| [005](/adr/monorepo-ci-change-detection) | Monorepo topology + change-detection CI |
| [006](/adr/security-hardening) | Launch security posture (P7) |
| [007](/adr/csp-without-nonces) | Static CSP without per-response nonces |

**[Reference](/architecture_plan)** — the architecture plan, the requirements corpus
and the phase guide. Background, not instructions.

## The one rule that matters most

> **A content change is never a deploy. A code change is never a content operation.**

Publishing in Strapi fires a signed webhook that calls `revalidateTag()` on the web
app; the affected pages regenerate on their next request, typically within two seconds,
with no build and no deploy. The CI pipeline builds and ships **code** only.

Two consequences follow, and both are easy to break by accident:

1. Never add `generateStaticParams` over the article catalogue — it would make deploy
   time grow with content and put engineering back in the publish path.
2. Never invalidate by rebuilding. If a change seems to need a redeploy before content
   appears, the cache-tag wiring is wrong; fix that instead.

## Running it locally

```bash
pnpm install
docker compose up          # postgres + redis + cms + web ×2
```

Two web instances against one Redis is not incidental — it is how multi-instance cache
invalidation gets exercised locally instead of discovered in production
([ADR-003](/adr/redis-cache-handler)). `next dev` bypasses the custom cache handler
entirely, so nothing about ISR or cache tags can be validated against it.
