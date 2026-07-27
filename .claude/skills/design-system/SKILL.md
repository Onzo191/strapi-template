---
name: design-system
description: Use when adding or editing UI components in packages/design-system, or CMS page-builder blocks in apps/web/components/blocks. Covers the shadcn/ui + Radix + CVA + Tailwind v4 conventions, design tokens, theming, motion, and how a block gets wired into the registry. Trigger words: component, block, button/card/dialog/form, variant, className, cn, cva, tokens, dark mode, theme, motion, Reveal.
---

# Design system & CMS blocks

Two layers, keep them separate:
- **`packages/design-system`** — reusable primitives (shadcn/ui style). No app/business logic.
- **`apps/web/components/blocks`** — CMS-driven page-builder blocks that *compose* primitives.

## UI primitive conventions (`packages/design-system/src/components/ui`)

- Style with **CVA** (`class-variance-authority`) for variants; merge classes with
  `cn()` from `../../lib/utils` (clsx + tailwind-merge). See `button.tsx` as the canonical pattern.
- Build interactive primitives on **Radix** (`@radix-ui/react-*`), already deps.
- Support polymorphism with Radix `Slot` + an `asChild` prop where it makes sense.
- Type props as `ComponentProps<"tag"> & VariantProps<typeof xVariants>`.
- **Colors come from semantic tokens only** — `bg-primary`, `text-muted-foreground`,
  `ring-ring`, etc. Never hardcode hex or raw palette. Tokens live in
  `src/styles/tokens.css`; dark mode is driven by `next-themes` via `theme/theme-provider`.
- Export every new component from `src/index.ts` (single barrel). Icons: `lucide-react`.
  Animation: `motion` + the shared `Reveal` wrapper (`src/motion/reveal.tsx`).
- No `"use client"` unless the primitive truly needs it (Radix interactive ones do).

## Adding a CMS block (`apps/web/components/blocks`)

A block needs **three** things wired together — do all three or it won't render:
1. **Zod schema** in `@vng/shared` for its `blocks.<name>` shape (discriminated union `zBlock`).
2. **Component** in `apps/web/components/blocks/<name>.tsx`, props = the block's variant of `Block`.
3. **Registry entry** in `apps/web/components/blocks/registry.tsx` mapping
   `"blocks.<name>"` → component.

`BlockRenderer` validates each entry with `zBlock.safeParse` and silently drops malformed
ones. The first block on a page renders with `Reveal disabled` (above-the-fold: avoid
CLS/LCP hit). Only wrap a block in `Suspense` if it does its own async fetch (see
`article-carousel`); blocks that receive resolved props don't need it.

## Should we switch to Astryx / another library?

No — the project is deeply invested in this shadcn+Tailwind v4 stack and CMS blocks are
built on it. Add primitives here instead of pulling a new library + toolchain.

## Verify
`pnpm --filter @vng/design-system typecheck` and `pnpm --filter @vng/web typecheck`.
