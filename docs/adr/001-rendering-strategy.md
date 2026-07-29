# ADR-001 — Rendering: ISR + cache tags, not SSG or SSR

- **Status:** Accepted
- **Date:** 2026-07 (P2/P3), reaffirmed at P7 hardening
- **Relates to:** plan §1, §5.1, §5.4, assumption A4

## Context

vng.com.vn is a bilingual corporate site with **thousands of articles** and a hard
requirement that publishing be *immediate* and require *no engineering involvement*
(Req §1/§5). Editors must be autonomous; a publish must not wait on a pipeline.

Three rendering strategies were viable in Next 16's App Router.

## Options

### Full static generation (SSG)

`generateStaticParams` over the whole catalogue, prerendering every article at build
time.

- **Fast** — pure static output, trivially cacheable at the edge.
- **Fatal for this workload.** Build time grows linearly with content, so it grows
  forever. Thousands of articles × two locales means every deploy prerenders tens of
  thousands of pages, and *a typo fix in one article requires a full rebuild and
  redeploy.* That directly contradicts "content change is never a deploy" (§5.4) and
  puts engineering back in the publish path — the thing the project exists to remove.

### Server-side rendering on every request (SSR)

- Always fresh, no cache to invalidate, no staleness reasoning at all.
- Every visitor costs a Strapi round-trip plus RDS queries. A news item on the VN
  homepage is a traffic spike, and the CMS becomes the capacity limit for the public
  site — the wrong thing to scale, and the wrong thing to have on the critical path
  when the marketing team schedules an announcement.
- Also fails the §6.4 Lighthouse budget (LCP < 2.5 s) on a throttled mobile
  connection, because TTFB now includes the CMS.

### ISR with on-demand tag revalidation (chosen)

Pages are generated on first request and cached. Publishing fires a signed webhook
that calls `revalidateTag()`, so the affected pages regenerate on their next request.
A time-based `cacheLife` window is retained as a safety net.

- Serves like static (high cache-hit ratio, edge-cacheable) **and** is fresh within
  ~2 s of a publish.
- Build time is constant regardless of content volume.
- Cost: pages need a Node runtime (so not a static-export deploy), and correctness now
  depends on the cache-tag scheme being right — a real, ongoing discipline.

## Decision

**ISR + on-demand `revalidateTag`**, with SSG reserved for the small static shell
(legal pages and similar) and SSR used nowhere for content.

Concretely:

- Cache tags are defined once in `packages/shared/src/client/tags.ts` and consumed by
  both the fetch layer and `/api/revalidate`, so the two cannot drift.
- `cacheLife` profiles: `static` (1 d), `content` (1 h SWR), `list` (10 m SWR). The
  time window is the self-healing path for a webhook that never arrived, and is
  **not** removed on the grounds that "tags handle it".
- `generateStaticParams` over content collections is prohibited — see the "content vs
  code" rule in AGENTS.md. It is the one change that would silently reintroduce the
  SSG failure mode.

## Consequences

- Cache-tag correctness is now a load-bearing concern. A read tagged differently from
  what the webhook invalidates produces a page that is stale *forever* (until its
  time window elapses) with no error anywhere. This is the most likely bug class in
  the system, so it gets: a single source of truth for tags, a debugging runbook
  (`.claude/skills/wire-revalidation-webhook`), and a load test.
- Multi-instance deployment makes a shared cache handler **mandatory**, not an
  optimisation → [ADR-003](003-redis-cache-handler.md).
- Per-response CSP nonces become incompatible with the caching model →
  [ADR-007](007-csp-without-nonces.md).
- `next dev` bypasses the custom cache handler, so nothing about this mechanism can be
  validated outside `docker compose up`.

## Revisit if

- Content volume drops to the low hundreds *and* publish frequency drops enough that
  build-time prerendering becomes tolerable (unlikely — the direction of travel is
  more content, not less).
- Next ships a caching model that makes per-request dynamic data cheap enough to
  reconsider SSR for content pages.
