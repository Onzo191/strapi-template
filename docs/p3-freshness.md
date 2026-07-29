# P3 — Instant content freshness (zero rebuild)

Implements §5.2–§5.4 of the [architecture plan](architecture_plan.md): publishing
in the CMS reflects on the frontend in **< ~2s**, with **no rebuild and no
redeploy**.

> **Updated by [ADR-008](adr/008-single-instance.md).** The original design used a
> Redis-backed cache handler so invalidation reached ≥2 web instances. The app now
> runs as a **single instance** and uses Next's own ISR cache; Redis is gone. The
> flow below reflects the current code. What that gives up is in the ADR.

## The flow

```
Editor publishes/updates/unpublishes in Strapi
        │
        ▼
Strapi document-service middleware  (apps/cms/src/webhooks/revalidation.ts)
  builds { model, documentId, slug, locale, … }, signs it HMAC-SHA256
  over `<unix-seconds>.<body>`, POSTs to the web app, with retry
        │
        ▼
POST /api/revalidate  (apps/web/app/api/revalidate/route.ts)
  verifies the HMAC + timestamp freshness (rejects unsigned/forged/replayed → 401)
  maps the entry → §5.2 cache tags  (tagsForEntry, @vng/shared)
  revalidateTag(...) [+ revalidatePath(...)]
        │
        ▼
Next's ISR cache marks those tags stale, in this process
        │
        ▼
The next request for an affected page treats its cached copy as stale
and regenerates from the CMS.
```

This is correct because the process that invalidates is the process that serves.
**It depends on running exactly one web instance** — a second replica would keep
serving its own cached copy, since the webhook reaches only one process. See
[ADR-008](adr/008-single-instance.md).

## The pieces

| Piece | File | Responsibility |
|---|---|---|
| Tag scheme + mapping | `packages/shared/src/client/tags.ts` | `tagsForEntry(payload)` → exact §5.2 tags. Single source of truth shared by the fetch layer and the webhook. |
| CMS webhook | `apps/cms/src/webhooks/revalidation.ts` | Document-service middleware on create/update/delete/publish/unpublish/discardDraft. Signs + retries. Registered in `src/index.ts` `register()`. |
| Web receiver | `apps/web/app/api/revalidate/route.ts` | HMAC verify (timing-safe), map→tags, `revalidateTag`/`revalidatePath`, idempotent, logs. |
| ISR cache | Next's own (no custom `cacheHandler`) | Per-instance, in-memory + filesystem. Invalidated in-process by `revalidateTag`. |

## Safety net (dropped webhooks self-heal)

Every CMS fetch is also time-boxed by a `cacheLife` profile (`next.revalidate`,
see `packages/shared/src/client/cache.ts`): `content` = 1h, `list` = 10m,
`static` = 1d. If a webhook is ever lost after all retries, the page still
refreshes within that window. The webhook makes it *instant*; the timer makes it
*eventually correct no matter what*.

## Security

- Webhooks are signed HMAC-SHA256 over `<unix-seconds>.<rawBody>` with a shared
  secret (`REVALIDATE_SECRET`, identical in both apps). The receiver rejects
  missing/forged/length-mismatched signatures with `401` using a constant-time
  compare, and rejects timestamps outside ±5 minutes so a captured request cannot
  be replayed. An attacker cannot force cache churn without the secret.
- In production the secret comes from the deployment's secret store, not env files.

## Prove it locally

```bash
docker compose up --build -d          # postgres + cms + web
# wait for the CMS to boot + seed (first run ~30-60s)

# HMAC checks + (with admin creds) the full publish→fresh check.
# The admin drives the real editor flow (update draft → publish):
ADMIN_EMAIL=you@vng.local ADMIN_PASSWORD='YourPass123!' ./scripts/verify-revalidation.sh
```

(Create the admin once via the Strapi admin UI at http://localhost:1337/admin, or
`POST /admin/register-admin` on a fresh DB. Omit the admin vars to run only the
HMAC checks.)

Expected tail:

```
1. HMAC verification
  ✓ unsigned request rejected (401)
  ✓ bad-signature request rejected (401)
  ✓ stale timestamp rejected (401)
  ✓ correctly-signed request accepted (200): {"revalidated":true,...}
2. Content freshness (end-to-end publish, no rebuild)
  ✓ published content fresh in NNNms (no rebuild)
  ✓ within the < 3s target
```

To see the cache itself working, count CMS requests rather than trusting a header
(Next 16 emits no `x-nextjs-cache` for App Router pages):

```bash
docker compose logs cms | grep -c 'GET /api/articles'   # before
curl -s -o /dev/null localhost:3000/vi/tin-tuc          # ×3
docker compose logs cms | grep -c 'GET /api/articles'   # unchanged ⇒ served from cache
```

## Content vs code (§5.4)

This entire path touches **content only** — it never builds or deploys. Code
changes go through CI/CD (§8.3); the two never cross.
