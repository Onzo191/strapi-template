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

## Verify
Check `<head>` output in dev, validate JSON-LD, and run the `qa-e2e` Lighthouse config for
SEO scores.

Background: the SEO/AIO commit history and `docs/website-req_details.md`.
