# ADR-003 — Redis-backed Next cache handler: mandatory, not optional

- **Status:** **Superseded by [ADR-008](008-single-instance.md)**
- **Date:** 2026-07 (P3)
- **Relates to:** plan §1, §5.3, assumptions A2 and A4

> **Superseded.** The delivery model changed to "two Docker images, one instance
> each" and assumption A2 (≥2 instances) was withdrawn, which removes the premise
> this ADR rests on — see [ADR-008](008-single-instance.md). Redis and
> `cache-handler.mjs` no longer exist in the codebase.
>
> Kept because the reasoning below is still correct *given* multiple instances, and
> it is the design to restore if the app is ever scaled out. The tag semantics in
> particular (mirroring Next's `tagsManifest` / `areTagsExpired`) took real effort
> to get right.

## Context

[ADR-001](001-rendering-strategy.md) commits the site to ISR with on-demand
`revalidateTag()`. Assumption **A2** commits it to **≥2 instances per app from day
one**, because a corporate flagship site needs HA.

Those two commitments interact in a way that is easy to miss until it bites in
production.

`revalidateTag()` marks a tag stale **in the process that executes it**. Next's
default incremental cache is per-instance: a filesystem cache local to the container,
plus an in-memory layer in front of it. The publish webhook is a single HTTP POST, so
it lands on exactly **one** instance behind the ALB.

The result: instance A regenerates, instance B keeps serving the old HTML until its
time-based window expires. Refresh the page and the content flips back and forth
depending on which task the load balancer picked. Editors see it as "the site is
broken"; it looks like a caching mystery and is actually just per-instance state.

## Options

### Default filesystem cache

Nothing to build. Unusable here for the reason above. Would only work with a single
instance, which contradicts A2 — and "just run one instance" trades HA for caching
convenience on a site that must not go down during a launch.

### CloudFront invalidation on publish

- Would clear the CDN, but not the origin caches — instance B still regenerates from
  its own stale entry.
- CloudFront invalidations are rate-limited and billed beyond a free allowance, so
  per-publish invalidation is both slow and a running cost.

### Broadcast the revalidation to every instance

Have the webhook receiver fan out to its peers.

- Requires service discovery, and is not idempotent under partial failure: if one
  instance is mid-deploy or briefly unreachable, it silently keeps stale content and
  nothing notices. Correctness would depend on delivery to *every* peer, which is
  exactly the guarantee a distributed system will not give you.

### Shared cache handler backed by Redis (chosen)

A custom `cacheHandler` (`apps/web/cache-handler.mjs`) stores both cached entries and
per-tag invalidation timestamps in ElastiCache Redis.

- `revalidateTag()` on **any** instance writes the tag's timestamp to shared Redis;
  every other instance sees it on its next read. Correctness comes from shared state,
  not from successful delivery to N peers.
- `cacheMaxMemorySize: 0` in `next.config.ts` disables Next's in-memory layer, so no
  instance can shadow Redis with a local copy and serve stale HTML.
- Cost: one more managed service, and the handler is our code to maintain against
  Next's internal cache semantics.

## Decision

**A Redis-backed custom `cacheHandler` is mandatory.** It is not a performance
optimisation that can be dropped in a lean environment; without it, on-demand
revalidation is silently incorrect on any multi-instance deployment.

Design notes that matter:

- Tag semantics mirror Next's own `FileSystemCache` (`areTagsExpired`), so behaviour is
  identical and only the store is shared.
- Redis is **best-effort**: a connection failure degrades to a cache MISS (regenerate
  from origin) or a no-op write. The site stays up and merely loses the shared-cache
  optimisation. A cache layer must never be able to take the site down.
- Time-based `cacheLife` is untouched, so a *dropped* webhook still self-heals.
- `docker compose up` runs **two** web instances against one Redis specifically so
  this is exercised locally rather than discovered in production.

## Consequences

- ElastiCache Redis is a hard production dependency for correctness (though not for
  availability — see the degradation behaviour above).
- The handler must be revisited on a Next major upgrade, since it implements an
  internal contract. Pinning Next and requiring an ADR for a major bump covers this.
- `next dev` does not use `cacheHandler`, so cache behaviour is only observable in the
  compose stack. This surprises people; it is called out in AGENTS.md and both app
  CLAUDE.md files.
- The same Redis is reused (under a separate key prefix) by the CMS rate limiter. The
  web app's own limiter deliberately does *not* share it — see
  [ADR-006](006-security-hardening.md).

## Revisit if

- Next ships first-class shared-cache support that covers tag invalidation across
  instances, making a custom handler redundant.
- The deployment collapses to a single instance permanently (it will not — A2).
