---
name: content-freshness
description: Use for cache invalidation and content freshness between Strapi and the web app — on-demand revalidation, the signed webhook from CMS, the ISR cache, and tag/path revalidation. Trigger words: revalidate, revalidateTag, revalidatePath, webhook, signed, HMAC, cache, ISR, freshness, stale, on-demand.
---

# Content freshness (CMS → web)

When Strapi content changes, the web app must reflect it fast without a full rebuild:

- Strapi fires a **signed webhook** (verify the signature/HMAC — reject unsigned requests)
  to a web revalidation route.
- The route maps the changed entity to Next cache **tags/paths** and calls
  `revalidateTag` / `revalidatePath`. Fetches must be tagged consistently for this to work.
- The cache is Next's own **per-instance ISR cache**. The app runs as a single instance
  ([ADR-008](../../../docs/adr/008-single-instance.md)), so revalidating here
  invalidates the cache that serves traffic. Adding a replica breaks this silently.

Full design and the exact tag scheme: **`docs/p3-freshness.md`** — read it before changing
webhook or tagging logic.

## Verify
`scripts/verify-revalidation.sh` exercises the flow. Confirm a content edit in CMS
propagates to the rendered page without a redeploy.
