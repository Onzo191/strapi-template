# P3 — Instant content freshness (zero rebuild)

Implements §5.2–§5.4 of the [architecture plan](architecture_plan.md): publishing
in the CMS reflects on the frontend in **< ~2s across every web instance**, with
**no rebuild and no redeploy**.

## The flow

```
Editor publishes/updates/unpublishes in Strapi
        │
        ▼
Strapi document-service middleware  (apps/cms/src/webhooks/revalidation.ts)
  builds { model, documentId, slug, locale, … }, signs it HMAC-SHA256,
  POSTs to ONE web instance, with retry
        │
        ▼
POST /api/revalidate  (apps/web/app/api/revalidate/route.ts)
  verifies the HMAC (rejects unsigned/forged → 401)
  maps the entry → §5.2 cache tags  (tagsForEntry, @vng/shared)
  revalidateTag(...) [+ revalidatePath(...)]
        │
        ▼
Redis-backed cacheHandler  (apps/web/cache-handler.mjs)
  stamps each tag's invalidation timestamp in SHARED Redis
        │
        ▼
Every web instance, on its next request for those tags, sees the stamp,
treats its cached copy as stale, and regenerates from the CMS.
```

The last two steps are why it works **cluster-wide**. The webhook only ever hits
one instance, but the invalidation lives in Redis, so `web2` — which never
received the webhook — goes fresh too.

## The pieces

| Piece | File | Responsibility |
|---|---|---|
| Tag scheme + mapping | `packages/shared/src/client/tags.ts` | `tagsForEntry(payload)` → exact §5.2 tags. Single source of truth shared by the fetch layer and the webhook. |
| CMS webhook | `apps/cms/src/webhooks/revalidation.ts` | Document-service middleware on create/update/delete/publish/unpublish/discardDraft. Signs + retries. Registered in `src/index.ts` `register()`. |
| Web receiver | `apps/web/app/api/revalidate/route.ts` | HMAC verify (timing-safe), map→tags, `revalidateTag`/`revalidatePath`, idempotent, logs. |
| Redis cache handler | `apps/web/cache-handler.mjs` | Custom Next `cacheHandler`; entries + per-tag invalidation timestamps in Redis → `revalidateTag` is cluster-wide. |
| Wiring | `apps/web/next.config.ts` | `cacheHandler` + `cacheMaxMemorySize: 0` (no instance-local layer can serve stale). |

## Safety net (dropped webhooks self-heal)

Every CMS fetch is also time-boxed by a `cacheLife` profile (`next.revalidate`,
see `packages/shared/src/client/cache.ts`): `content` = 1h, `list` = 10m,
`static` = 1d. If a webhook is ever lost after all retries, the page still
refreshes within that window. The webhook makes it *instant*; the timer makes it
*eventually correct no matter what*.

## Security

- Webhooks are signed HMAC-SHA256 over the exact request body with a shared
  secret (`REVALIDATE_SECRET`, identical in both apps). The receiver rejects
  missing/forged/length-mismatched signatures with `401` using a constant-time
  compare. An attacker cannot force cache churn without the secret.
- In production the secret comes from AWS Secrets Manager (§8.1), not env files.

## Prove it locally

```bash
docker compose up --build -d          # postgres + redis + cms + web + web2
# wait for the CMS to boot + seed (first run ~30-60s)

# HMAC checks + (with admin creds) full publish→fresh-on-both-instances check.
# The admin drives the real editor flow (update draft → publish):
ADMIN_EMAIL=you@vng.local ADMIN_PASSWORD='YourPass123!' ./scripts/verify-revalidation.sh
```

(Create the admin once via the Strapi admin UI at http://localhost:1337/admin, or
`POST /admin/register-admin` on a fresh DB. Omit the admin vars to run only the
HMAC checks.)

`web` is published to on `:3000` and `web2` on `:3001`; the CMS webhook targets
`web` only (`WEB_REVALIDATE_URL=http://web:3000/api/revalidate`). The script
asserts the change appears on **both** in under 3s — `web2` going fresh proves
Redis propagation, since it never saw the webhook.

Expected tail:

```
1. HMAC verification
  ✓ unsigned request rejected (401)
  ✓ bad-signature request rejected (401)
  ✓ correctly-signed request accepted (200): {"revalidated":true,...}
2. Multi-instance content freshness (end-to-end)
  ✓ web  (got webhook)      fresh in NNNms
  ✓ web2 (NO webhook, Redis) fresh in NNNms
  ✓ both instances fresh in NNNms (< 3s target)
```

## Content vs code (§5.4)

This entire path touches **content only** — it never builds or deploys. Code
changes go through CI/CD (§8.3); the two never cross.
