---
name: content-freshness
description: Use for cache invalidation and content freshness between Strapi and the web app — on-demand revalidation, the signed webhook from CMS, the Redis cache handler, and tag/path revalidation. Trigger words: revalidate, revalidateTag, revalidatePath, webhook, signed, HMAC, redis, cache handler, ISR, freshness, stale, on-demand.
---

# Content freshness (CMS → web)

When Strapi content changes, the web app must reflect it fast without a full rebuild:

- Strapi fires a **signed webhook** (verify the signature/HMAC — reject unsigned requests)
  to a web revalidation route.
- The route maps the changed entity to Next cache **tags/paths** and calls
  `revalidateTag` / `revalidatePath`. Fetches must be tagged consistently for this to work.
- A **Redis cache handler** backs Next's data cache so revalidation is shared across
  instances, not per-process.

Full design and the exact tag scheme: **`docs/p3-freshness.md`** — read it before changing
webhook or tagging logic.

## Verify
`scripts/verify-revalidation.sh` exercises the flow. Confirm a content edit in CMS
propagates to the rendered page without a redeploy.
