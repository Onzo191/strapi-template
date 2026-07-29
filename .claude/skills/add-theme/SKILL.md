---
name: add-theme
description: Step-by-step recipe for adding a named theme — a design-token set in globals.css, the THEMES registry, next-themes wiring and the theme-toggle entry. Use when asked to add or change a theme / colour scheme / dark mode variant / high-contrast mode (e.g. "add a sepia theme", "add a Tet campaign theme", "make the contrast theme WCAG AAA").
---

# Recipe: add a theme

Themes are **token sets**, not stylesheets. Every component already reads semantic
CSS variables (`--background`, `--primary`, `--muted-foreground`, …), so a new theme
is one `[data-theme="…"]` block plus three registrations. No component changes.

Current themes: `light`, `dark`, `contrast` (see
`packages/design-system/src/theme/theme-provider.tsx`).

Worked example: a `sepia` theme.

---

## 1. Token set

`apps/web/app/globals.css`. Copy the **whole** `:root` variable list and re-tint it —
a partial override inherits the rest from `:root`, which produces a theme that looks
right on the home page and breaks on a form or an alert nobody checked.

```css
:root[data-theme="sepia"] {
  --background: oklch(0.96 0.02 85);
  --foreground: oklch(0.24 0.03 60);

  --card: oklch(0.98 0.015 85);
  --card-foreground: var(--foreground);
  --popover: var(--card);
  --popover-foreground: var(--foreground);

  --primary: oklch(0.45 0.09 55);
  --primary-foreground: oklch(0.98 0.01 85);
  --secondary: oklch(0.90 0.03 85);
  --secondary-foreground: oklch(0.28 0.04 60);

  --muted: oklch(0.92 0.02 85);
  --muted-foreground: oklch(0.48 0.03 60);
  --accent: oklch(0.88 0.04 80);
  --accent-foreground: oklch(0.26 0.04 60);

  --destructive: oklch(0.52 0.19 27);
  --destructive-foreground: oklch(0.98 0.01 85);

  --border: oklch(0.86 0.02 85);
  --input: var(--border);
  --ring: var(--primary);
}
```

Use the same colour space as the existing themes (**oklch**) — mixing in hex or hsl
makes relative lightness impossible to reason about, which is exactly what you need
when checking contrast.

Non-negotiable, because the §6.4 Lighthouse a11y budget is ≥95 and it audits
contrast: **every** foreground/background pair must clear WCAG AA — 4.5:1 for body
text, 3:1 for large text and UI boundaries. Check at minimum:

- `--foreground` on `--background`
- `--muted-foreground` on `--background` **and** on `--muted` (the usual failure —
  muted-on-muted is easy to get to 3.9:1 and it is body text)
- `--primary-foreground` on `--primary`
- `--destructive-foreground` on `--destructive`
- `--border` against `--background` (≥3:1, or focus rings and inputs disappear)

## 2. Register it

`packages/design-system/src/theme/theme-provider.tsx`:

```ts
export const THEMES = ["light", "dark", "contrast", "sepia"] as const;
```

`THEMES` is the single source of truth: it feeds `next-themes`' `themes` prop (which
is what allows the class to be applied at all) and `ThemeName`, so the toggle can't
list a theme that doesn't exist.

## 3. Toggle entry

`packages/design-system/src/theme/theme-toggle.tsx` — add the menu item with a label
and icon, following the existing entries. If the toggle uses a label map, add the
key there; a missing entry renders a raw slug in the UI.

Labels are user-facing, so they need VI and EN strings in
`apps/web/messages/{vi,en}.json` if the toggle is translated. Check how the existing
three are labelled before hard-coding English.

## 4. Dark-mode heuristics

`next-themes` is configured with `attribute="data-theme"` and `enableSystem`, so
`system` resolves to `light`/`dark` only. A new named theme is an **explicit** choice
and is never auto-selected — that is intended.

If the new theme is *dark-like*, also set `color-scheme` so native form controls,
scrollbars and the browser UI match:

```css
:root[data-theme="sepia"] { color-scheme: light; }
```

Getting this wrong gives you a dark page with white native `<select>` dropdowns.

## 5. Test

`qa/e2e/theme.spec.ts` already walks the toggle and asserts `data-theme` persists
across a reload. Extend it:

```ts
await page.getByRole("button", { name: "Change theme" }).click();
await page.getByRole("menuitem", { name: "Sepia" }).click();
await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");
await page.reload();
await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");
```

## Verify

```bash
pnpm typecheck && pnpm lint
docker compose up
pnpm --filter @vng/qa e2e -- theme
pnpm --filter @vng/qa lighthouse   # a11y ≥ 95 — this is where contrast fails
```

Walk a page with the widest block mix (`/vi/about`) in the new theme and look
specifically at: form inputs and their focus ring, the contact form's error text,
disabled buttons, the nav dropdown, and any `muted-foreground` body copy. Those are
where an incomplete token set shows first.

Related: `.claude/skills/design-system`.
