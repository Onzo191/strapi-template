---
name: add-language
description: Step-by-step recipe for adding a locale end to end — next-intl routing, a message catalogue, the Strapi i18n locale, hreflang/sitemap alternates, translated slugs and the locale switcher. Use when asked to add or change a language / locale (e.g. "add Japanese", "add zh-TW for the Taiwan market", "make Korean the default").
---

# Recipe: add a language

Current locales: **`vi`** (default) and **`en`**, per Req §7 — independent slugs,
titles and SEO per locale, not a mirrored translation.

Six places, and two of them are the ones that get forgotten:

| Missing | Symptom |
|---|---|
| `routing.locales` | `/ja/...` 404s |
| `messages/<locale>.json` | the layout throws on a missing key |
| Strapi locale | editors cannot create content in it — **the FE renders empty pages** |
| hreflang / sitemap | the locale exists but is invisible to search |
| switcher label | the language cannot be reached from the UI |
| font subset | missing glyphs render as tofu boxes |

Worked example: adding `ja`.

---

## 1. next-intl routing

`apps/web/i18n/routing.ts`:

```ts
export const routing = defineRouting({
  locales: ["vi", "en", "ja"],
  defaultLocale: "vi",
  localePrefix: "always",
  pathnames: {
    "/tin-tuc": { vi: "/tin-tuc", en: "/tin-tuc", ja: "/tin-tuc" },
    // …every existing entry needs a `ja` value — the type is exhaustive,
    // so `pnpm typecheck` will list them all for you.
  },
});
```

`pathnames` is where **translated route segments** live. Note the existing entries
keep `/tin-tuc` for `en` too — a deliberate call, because the legacy 301 map (Req §6)
points at those paths and changing them would invalidate it. Decide consciously
whether the new locale gets a translated segment; if it does, it needs redirect rows
for any inbound links.

Also widen the `Locale` type in `packages/shared/src/types/media.ts` — it is what the
typed client and the sitemap key off.

## 2. Message catalogue

Copy `apps/web/messages/en.json` to `ja.json` and translate. `next-intl` throws on a
missing key at render time rather than falling back, so the catalogue must be
**complete**. `pnpm typecheck` catches missing keys if the messages type is derived
from `en.json` — check `apps/web/i18n/request.ts` for how it is wired.

These are UI chrome strings only ("Read more", "Previous", "Change theme"). Content
strings live in Strapi.

## 3. Strapi locale

Locales are **database rows**, not config. Add it to
`apps/cms/src/bootstrap/locales.ts` so every environment provisions it identically:

```ts
const LOCALES = [
  { code: "vi", name: "Vietnamese (vi)", isDefault: true },
  { code: "en", name: "English (en)" },
  { code: "ja", name: "Japanese (ja)" },
];
```

Keep it idempotent — it runs on every boot.

**This is the step whose absence is most confusing.** Without it the FE routes work,
every page renders, and every page is empty, because `?locale=ja` matches no content.

Content is *not* auto-translated: an editor creates the `ja` localization of each
entry. Expect a content-team plan, not just a deploy. Until entries exist, decide
what an empty locale should do — 404 (via `notFound()`) is usually better for SEO
than an empty 200.

## 4. hreflang, canonical, sitemap

Mostly automatic, but verify each:

- `apps/web/lib/seo.ts` → `buildMetadata` emits `alternates.languages` from the
  entry's `localizations`. It only lists locales that actually have a localization,
  which is correct: a dangling hreflang is flagged as an error in Search Console.
- `apps/web/app/sitemap.ts` iterates `routing.locales`, so the new locale appears
  once step 1 is done.
- `qa/e2e/seo.spec.ts` asserts hreflang round-trips and that each alternate resolves
  200. Extend the locale list there.

## 5. Locale switcher

`apps/web/components/layout/locale-switcher.tsx` renders from `routing.locales`, so
it usually needs no change — but check for a hard-coded label/flag map and add the
entry. A display name should be in the language itself (日本語, not "Japanese").

## 6. Fonts and typography

`apps/web/app/[locale]/layout.tsx` loads `Be_Vietnam_Pro` with the `vietnamese` +
`latin` subsets. A locale outside those scripts needs its own font or subset, or it
renders as tofu boxes:

```ts
const notoJp = Noto_Sans_JP({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
```

Every added font file is preloaded critical-path bytes, so check the §6.4 LCP budget
after. Prefer loading the extra font **only** for that locale rather than globally.

Also check `lang` on `<html>` (already driven by the route param) and any
locale-dependent formatting — `next-intl`'s `useFormatter` handles dates and numbers,
so don't hand-roll them.

## Verify

```bash
pnpm typecheck && pnpm lint      # exhaustive `pathnames` will list what's missing
docker compose up --build
```

1. `/ja` renders with translated chrome.
2. Create a `ja` localization of one article in the admin, publish it, and confirm it
   appears on the FE without a rebuild.
3. `curl -s localhost:3000/sitemap.xml | grep '/ja/'` — present.
4. On the article, confirm `<link rel="alternate" hreflang="ja">` exists **and**
   resolves 200.
5. `pnpm --filter @vng/qa e2e -- locale seo`
6. `pnpm --filter @vng/qa lighthouse` — a new font subset is the usual regression.

Related: `.claude/skills/i18n-routing`, `.claude/skills/seo-aio`.
