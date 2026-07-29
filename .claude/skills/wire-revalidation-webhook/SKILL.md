---
name: wire-revalidation-webhook
description: Step-by-step recipe for wiring content freshness — the Strapi document-service middleware that fires a signed webhook, the cache-tag mapping, and the Next Route Handler that calls revalidateTag. Use when content does not appear on the site after publishing, when adding a content type to the freshness path, or when changing/debugging the revalidation webhook, HMAC signing or cache tags.
---

# Recipe: wire (or debug) the revalidation webhook

This is the mechanism behind the platform's central promise: **publishing is not a
deploy** (§5.4). An editor publishes, a signed webhook fires, cache tags go stale, and
the next request regenerates — typically under two seconds, with no build.

```
Editor publishes
  → Strapi document-service middleware (src/webhooks/revalidation.ts)
  → POST /api/revalidate  + HMAC over `<unix-seconds>.<body>`
  → verify signature + replay window
  → map entry → §5.2 cache tags
  → revalidateTag(tag, { expire: 0 })
  → Next's ISR cache marks the tag stale, in this process
  → next request regenerates
```

---

## Adding a content type to the freshness path

Four edits, all of which must agree:

**1. Watch the model** — `apps/cms/src/webhooks/revalidation.ts`:

```ts
const WATCHED_MODELS: Record<string, RevalidateModel> = {
  // …existing…
  "api::press-release.press-release": "press-release",
};
```

**2. Declare the tags** — `packages/shared/src/client/tags.ts`:

```ts
export const LIST_PRESS_TAG = "list:press-releases";
export function pressTag(slug: string) { return `press-release:${slug}`; }

export type RevalidateModel = /* … */ | "press-release";
```

**3. Map entry → tags** — same file, inside `tagsForEntry`:

```ts
case "press-release": {
  if (p.slug) tags.add(pressTag(p.slug));
  tags.add(LIST_PRESS_TAG);
  break;
}
```

**4. Tag the reads** — every fetch in `strapi-client.ts` that returns this content must
carry the matching tags. A read tagged differently from what the webhook invalidates
is the single most common cause of "it didn't update".

Then `pnpm --filter @vng/shared build` — Strapi requires the compiled CJS bundle, so
without this the CMS keeps the old `tagsForEntry`.

## Why a document-service middleware, not a lifecycle hook

`strapi.documents.use()` fires **once per document action** with the `documentId` and
locale, and — the reason it's required here — it distinguishes `publish` / `unpublish`
from a plain `update`. A model lifecycle (`afterUpdate`) cannot: an unpublish looks
like an update, so an unpublished article would stay cached and publicly visible.

Two invariants in that middleware, both deliberate:

- **Everything after `await next()` is best-effort.** A bug in webhook delivery must
  never turn a successful save into a failed one for the editor. Errors are swallowed
  and logged.
- **Delivery is fire-and-forget with retry** (3 attempts, exponential backoff). The
  editor's save is never blocked on the network.

## Signing

The HMAC covers `<unix-seconds>.<rawBody>`, not the body alone, and the receiver
rejects timestamps outside ±5 minutes (`packages/shared/src/security/signature.ts`).

Binding the timestamp *into* the signed payload is the point. A bare timestamp header
the signature didn't cover could simply be rewritten by whoever replays the request,
and each replay forces a cache purge plus a full regeneration storm against Strapi —
an amplified DoS using an entirely authentic message.

Both ends read the header names and the `signingPayload()` helper from
`@vng/shared`, so they cannot drift apart.

`REVALIDATE_SECRET` must be identical on both sides. Generate with
`openssl rand -hex 32`.

## Why this only works with one web instance

`revalidateTag()` marks the tag stale **in the process that ran it**, and the cache is
Next's own per-instance ISR cache. The webhook is a single HTTP POST, so it reaches
exactly one process.

With one instance that is exactly right: the process that invalidates is the process
that serves. Add a second replica and the webhook updates whichever one received it
while the others keep serving old HTML until their time-based window expires (10 min
for lists, 1 h for content, 1 d for static). It presents as content flickering between
old and new depending on which replica answered — a caching mystery that is really
just per-process state.

So **do not add a web replica** without restoring a shared cache handler first.
[ADR-008](../../../docs/adr/008-single-instance.md) records the decision and
[ADR-003](../../../docs/adr/003-redis-cache-handler.md) has the shared-cache design to
restore, including the tag semantics.

`next dev` does not use the production ISR cache — nothing about this mechanism can be
validated against it. Use `docker compose up`.

## Debugging "I published and nothing changed"

Work down the chain; each step tells you whether to keep going.

**1. Did the webhook fire?**

```bash
docker compose logs cms | grep revalidate
```

- `webhook wired → …` absent → `WEB_REVALIDATE_URL` / `REVALIDATE_SECRET` unset, so
  the webhook is disabled and only time-based revalidation is running.
- `sent model=… (attempt 1)` → the CMS side is fine; go to step 2.
- `gave up after 3 attempts` → network/URL problem between the containers.

**2. Did the web app accept it?**

```bash
docker compose logs web | grep revalidate
```

- `invalid signature` → the secrets differ between the two apps.
- `stale or missing timestamp` → clock skew over 5 minutes, or an old CMS build that
  signs without the timestamp header.
- `tags=[…]` → note the tags it actually invalidated, then step 3.

**3. Do those tags match what the page fetched?** This is where the bug usually is.
Compare the logged tags against the `tags:` argument in the `strapi-client.ts` method
the page calls. A page that fetched `list:articles` is not invalidated by
`article:abc123`.

**4. Is more than one web instance running?**

```bash
docker compose ps web
```

The ISR cache is per-process, so a second replica serves its own stale copy — content
that flips between old and new on refresh is this, not a tagging bug. Scale back to one
and re-test; see the section above.

**5. Is it the fetch, not the cache?** Confirm the page actually re-reads the CMS:
`docker compose logs cms | grep -c 'GET /api'` before and after a request to the page.
No new request means the cache entry was served, so the tag never matched (back to
step 3). New requests but stale output means the CMS itself returned old data — check
that the entry was really published, not just saved as a draft.

## Load-testing the path

The endpoint is fast; the risk is the regeneration storm behind it. A bulk publish
invalidates many tags at once, and every affected page then misses and refetches
Strapi simultaneously.

```bash
REVALIDATE_SECRET=dev-revalidate-secret-change-me \
  pnpm --filter @vng/qa load:revalidate -- --requests 200 --concurrency 20
```

It reports three phases — warm, burst, and *first request after invalidation*. That
third number is what the "< 2 s freshness" claim rests on; the script fails the build
if its p95 exceeds 2000 ms.

## Verify a change end to end

```bash
pnpm --filter @vng/shared build && docker compose up --build
```

1. Publish an article in the admin.
2. Within ~2 s it appears on `localhost:3000` — with no rebuild.
3. **Unpublish** it — it disappears. (This is the case a lifecycle hook would have
   missed.)
4. `docker compose logs web | grep revalidate` shows the expected tag set.

Or run the whole thing: `./scripts/verify-revalidation.sh` (set `ADMIN_EMAIL` +
`ADMIN_PASSWORD` to include the real publish flow).

Related: `.claude/skills/content-freshness`, `.claude/skills/add-content-type`,
[docs/adr/008-single-instance.md](../../docs/adr/008-single-instance.md).
