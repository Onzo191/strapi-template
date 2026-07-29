---
name: seo-aio
description: Use for SEO / AI-optimization work in apps/web — page metadata, Open Graph, JSON-LD structured data, sitemap.xml, robots, canonical + hreflang alternates, redirects, and preview links. Trigger words: metadata, generateMetadata, JSON-LD, schema.org, sitemap, robots, canonical, hreflang, alternates, Open Graph, og:image, redirect, 301, preview.
---

# SEO / AIO (`apps/web`)

First-class SEO is a core requirement of this site — treat metadata as part of "done" for
any new page or route.

- **Metadata:** each route exports `generateMetadata` returning title, description,
  canonical, and `alternates.languages` (hreflang) for every locale. Don't hardcode the
  origin — derive from config/env so preview vs prod stay correct.
- **hreflang / canonical:** every localized page must declare its alternates; canonical
  must be the self-referential localized URL. This is coupled with `i18n-routing` — keep
  locale slugs consistent on both sides.
- **JSON-LD:** inject `<script type="application/ld+json">` with the right schema.org type
  (Article/NewsArticle for `tin-tuc`, BreadcrumbList, Organization). Match fields to the
  CMS content actually rendered.
- **Sitemap / robots:** generated routes — keep new public route types included, drafts
  and preview excluded.
- **Redirects:** managed via the importer/redirect system (see recent SEO commit); prefer
  data-driven 301s over hardcoding.

## ⚠ Open defect: metadata is emitted into `<body>`, not `<head>`

**Found during the P7 hardening pass. Not yet fixed. Launch-blocking for SEO.**

On every page, `<title>`, `<meta name="description">` and `<link rel="canonical">` are
rendered **after `</head>`**, inside the body. Verified in the real browser DOM — they are
still in `<body>` three seconds after hydration, so React never hoists them:

```js
// on http://localhost:3000/vi, after networkidle + 3s
document.head.querySelector("title")                    // null
document.head.querySelector('meta[name="description"]') // null
document.head.querySelector('link[rel="canonical"]')    // null
document.querySelector('meta[name="description"]').parentElement.tagName // "BODY"
```

`<head>` is 1202 bytes and holds only charset, viewport, the stylesheet and script tags.
Body opens with `<div hidden=""><!--$?--><template id="B:0">` — Next's **streaming
metadata** Suspense placeholder.

### Why it happens

Every route's `generateMetadata` is `async` (it fetches the CMS). Next flushes `<head>`
before that promise resolves and streams the metadata later, into the body.

### What it costs

- **`rel=canonical` in `<body>` is ignored by Google.** That is the mechanism the whole
  P4 canonical/duplicate-content cleanup depends on (§6.3, the www/non-www work).
- Lighthouse's `meta-description` audit fails on every page → **SEO category 91, against
  a ≥95 budget.** The budget is doing its job; do not relax it.
- `document.title` *is* set (browsers honour a stray `<title>`), so this is invisible in a
  browser — which is why it survived to P7.

### Ruled out

- **Not the Redis cache handler.** A cache-busted fresh render is byte-identical in head
  size and placement, so serialization is not involved.
- **Not user-agent gating.** `htmlLimitedBots` makes Next block the shell for listed
  crawlers, but these pages are ISR-cached, so one cached HTML is served to everyone —
  Googlebot included. Confirmed by request with a Googlebot UA.
- **Not a missing root layout.** `app/[locale]/layout.tsx` correctly owns `<html>`/`<body>`;
  that is the documented next-intl layout.

### Candidate fixes, best first

1. **Serve the canonical as an HTTP header** — `Link: <url>; rel="canonical"`. Google fully
   supports it, it is immune to DOM placement, and `proxy.ts` already runs per-request so it
   can emit a per-URL value that ISR caching cannot stale.
2. **Make `generateMetadata` resolve without awaiting the CMS** where the values are already
   known (title/description often duplicate the page's own fetch, which React dedupes) so it
   resolves before the head flush.
3. **Track the Next option.** Next 16.2 exposes only `htmlLimitedBots`; watch for a flag that
   disables streaming metadata outright, then set it.

Reproduce with `curl -s localhost:3000/vi | head -c 1400` — if metadata appears inside
`</head>`, this is fixed and this section should be deleted.

## Verify
Check `<head>` output in dev, validate JSON-LD, and run the `qa-e2e` Lighthouse config for
SEO scores.

Background: the SEO/AIO commit history and `docs/website-req_details.md`.
