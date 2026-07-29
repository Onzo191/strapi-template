# ADR-008 — Single instance per app; no shared cache, no Redis

- **Status:** Accepted
- **Date:** 2026-07
- **Supersedes:** [ADR-003](003-redis-cache-handler.md)
- **Amends:** assumption **A2** (≥2 instances per app), plan §8.1
- **Relates to:** [ADR-001](001-rendering-strategy.md) (ISR + cache tags),
  [ADR-006](006-security-hardening.md) (rate limiting)

## Context

The delivery model changed. The original plan (§8) had this team owning the AWS
topology: ECS Fargate, ≥2 tasks per app behind ALBs, ElastiCache, Terraform, a
blue-green deploy pipeline. Assumption **A2** — multi-instance from day one — came
out of that, and [ADR-003](003-redis-cache-handler.md) followed from A2: with two
instances and a webhook that lands on only one of them, a shared cache is the only
way `revalidateTag()` can be correct.

The scope is now narrower and explicit: **this repository's deliverable is two
Docker images.** Deployment, scaling and CI/CD belong to a separate systems team.
Nothing here knows how many replicas they will run, what the load balancer is, or
whether a Redis exists in their environment.

That reframing removes the premise A2 rested on, and with it the justification for
Redis. It also exposed a cost that A2 had been hiding.

## The cost that forced the decision

The Redis cache handler was wired unconditionally: `cacheHandler` was always set,
with `cacheMaxMemorySize: 0` to stop a local memory layer shadowing Redis. Handed
to a systems team that does not provision Redis, that configuration does not
degrade to Next's default cache — it degrades to **no cache at all**. `get()`
returns `null` on every read, `set()` is a no-op, and every request re-renders
against Strapi.

The failure is silent. The container reports healthy (`/api/health` deliberately
does not probe dependencies), pages render correctly, and the only symptoms are a
Strapi instance under many times its expected load and a Lighthouse budget that
quietly stops being met. A handover artefact whose worst failure mode is invisible
is the wrong artefact to hand over.

The same shape applied to the CMS rate limiter: Redis-backed, and **inactive** —
with a warning nobody reads — whenever `REDIS_URL` was unset. A security control
that defaults to off in every environment that forgets one variable is not a
control.

## Options

### Keep Redis, make it optional

Set `cacheHandler` only when `REDIS_URL` is present; fall back to Next's default
cache otherwise. Correct in both topologies, ~15 lines, keeps the door open to
scaling out.

Rejected: it keeps two cache code paths, a dependency, and a service in every
environment diagram, in exchange for an HA capability nobody has asked for and the
receiving team has not planned for. Optionality that is never exercised is carrying
cost, and the untested path is the one that will be running in production.

### Keep Redis, mandatory (status quo, ADR-003)

Rejected: it makes correct operation depend on a service the deploying team was
never told is load-bearing, with a silent failure mode. See above.

### Single instance, no shared cache (chosen)

One web container, one CMS container. The ISR cache is Next's own — in-memory plus
filesystem, per instance. `revalidateTag()` runs in the same process that serves
pages, so the publish webhook invalidates the only cache there is. The CMS rate
limiter counts in a process-local `Map`.

## Decision

**Run one instance of each app. Remove Redis entirely.**

- `apps/web` sets no custom `cacheHandler`; Next's default ISR cache is used.
- `apps/web/cache-handler.mjs` is deleted, along with the `redis` dependency in
  both apps.
- `apps/cms/src/middlewares/rate-limit.ts` counts in-process, with the same four
  tiers and budgets as before.
- `docker-compose.yml` runs one `web` and one `cms`; the second web instance
  (`web2`, port 3001) that existed to prove cross-instance propagation is gone
  along with the property it proved. Stateful services moved to
  `docker-compose.infra.yml` so they can be brought up independently.

### What this gives up, stated plainly

1. **HA.** One container per app means a restart is a brief outage. A2 wanted
   otherwise. This is now the systems team's problem to solve, and they can solve
   it at a layer this repo does not model.
2. **Horizontal scale.** More traffic means a bigger container, not more of them.
3. **Cross-instance cache coherence.** Not degraded — *absent*. This is the sharp
   edge: nothing in the code prevents a second replica from being started, and if
   one is, publishing content updates whichever instance received the webhook while
   the others serve stale HTML until their time-based window expires (10 min for
   lists, 1 h for content, 1 d for static — see `cacheLife` in
   `packages/shared/src/client/cache.ts`). It presents as content flickering
   between old and new depending on which replica answered.
4. **Cluster-wide rate limiting.** With N instances an attacker gets
   `limit × N` attempts and can round-robin so no instance trips.
   `RATE_LIMIT_INSTANCES` divides the budgets as a partial mitigation; it cannot
   make counting shared.

The time-based revalidation window in ADR-001 remains the safety net for a dropped
webhook, exactly as before. That part does not depend on where the cache lives.

## Consequences

- One fewer service to provision, secure, monitor and pay for; no `REDIS_URL` in
  any environment.
- Rate limiting is now **always in force** rather than silently inactive without
  Redis, and fails closed instead of open — a strict improvement over ADR-006's
  posture for every environment that lacked Redis.
- `scripts/verify-revalidation.sh` no longer proves cross-instance propagation,
  because there is nothing to propagate to. It still proves HMAC rejection and
  end-to-end publish freshness.
- The deployment contract must state the single-instance constraint, because it is
  not enforceable from inside the image. This is the most important consequence:
  the constraint now lives in documentation rather than in code.

## Revisit this when

- **Traffic or availability requires more than one web replica.** Restore a shared
  cache handler (ADR-003 has the design and the tag semantics) and move the CMS
  limiter to a shared store. Do not scale out first and add the cache afterwards —
  the intervening staleness is exactly the bug ADR-003 was written about.
- **The systems team introduces its own replica management** (an autoscaling group,
  a Kubernetes `Deployment` with `replicas > 1`). Same remedy; the trigger is the
  replica count, not the platform.
- **A CDN is placed in front with a long HTML TTL.** Then cache coherence moves to
  the CDN layer and needs its own invalidation-on-publish design, which this ADR
  does not cover.
