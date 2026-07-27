---
name: i18n-routing
description: Use for localization and locale routing in apps/web — next-intl setup, the [locale] segment, message catalogs in apps/web/messages/*.json (en/vi), locale switching, and translated slugs. Trigger words: i18n, locale, next-intl, translation, messages, en.json, vi.json, useTranslations, getTranslations, locale switcher, hreflang slugs.
---

# i18n & locale routing (`apps/web`)

- **next-intl** with a `[locale]` route segment; `vi` and `en` catalogs live in
  `apps/web/messages/{vi,en}.json`. Keys must exist in **both** files — a key present in
  one only will break the other locale.
- Server components: `getTranslations`; client components: `useTranslations`. Add
  `"use client"` only for the interactive pieces (e.g. `locale-switcher`).
- Keep message keys namespaced by feature/component; don't inline user-facing strings.
- Localized slugs must stay consistent with the `seo-aio` hreflang/canonical alternates —
  if you add a translated route slug, update the alternates generation too.

## Verify
Load both `/vi/...` and `/en/...`, confirm no missing-message warnings; `pnpm --filter
@vng/web typecheck`.

Background: `docs/website-req_details.md`.
