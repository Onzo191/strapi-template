---
name: add-page-builder-block
description: Step-by-step recipe for adding a page-builder block — a Strapi component, its Zod schema and TS type in @vng/shared, the React renderer, and the block-registry entry. Use when asked to add or change a CMS block / section / dynamic-zone entry (e.g. "add a pricing-table block", "add a video hero", "add a stats band editors can drop into a page").
---

# Recipe: add a page-builder block

A block spans both apps and **four** files must agree, or it fails quietly:

| Missing | Symptom |
|---|---|
| Strapi component | the block cannot be added to a page at all |
| dynamic zone entry | the component exists but no page offers it |
| Zod schema | runtime parse throws, or the block is silently dropped |
| registry entry | editors add the block, the page renders **nothing**, no error |

That last one is the trap: the FE block registry maps `__component` → React
component, and an unknown key renders `null` by design (so a half-deployed block
never white-screens a page). Nothing tells you it happened.

Worked example: a `pricing-table` block.

---

## 1. Strapi component

`apps/cms/src/components/blocks/pricing-table.json`

```json
{
  "collectionName": "components_blocks_pricing_tables",
  "info": {
    "displayName": "Pricing Table",
    "icon": "grid",
    "description": "Tiered pricing grid."
  },
  "options": {},
  "attributes": {
    "heading": { "type": "string" },
    "description": { "type": "text" },
    "tiers": {
      "type": "component",
      "repeatable": true,
      "component": "elements.pricing-tier",
      "required": true
    },
    "background": {
      "type": "enumeration",
      "enum": ["default", "muted", "accent"],
      "default": "default"
    }
  }
}
```

Repeatable child items go in `elements/` (`elements.pricing-tier`), matching the
existing `faq-item`, `stat-item`, `timeline-item` pattern. Reuse `shared.link` for
any CTA rather than modelling `label`+`href` again — `ActionLink` already renders it
with variant handling and scheme safety.

Add it to every dynamic zone that should offer it:

```json
// apps/cms/src/api/landing-page/content-types/landing-page/schema.json
"blocks": {
  "type": "dynamiczone",
  "components": ["blocks.hero", "blocks.rich-text", "blocks.pricing-table"]
}
```

A component absent from the zone list is invisible to editors even though it exists.

## 2. Populate

Dynamic zones are polymorphic, so they need per-component `on` population.
`packages/shared/src/population.ts` → `BLOCKS_POPULATE`:

```ts
export const BLOCKS_POPULATE = {
  on: {
    // …existing…
    "blocks.pricing-table": {
      populate: { tiers: { populate: { cta: true } } },
    },
  },
};
```

Forget this and `tiers` comes back as `{ count: n }` instead of an array — which
looks like a rendering bug and is actually a populate bug.

## 3. Type + Zod schema

`packages/shared/src/types/blocks.ts`:

```ts
export interface PricingTierItem {
  id: number;
  name: string;
  price: string;
  features: string | null;
  cta?: LinkComponent | null;
}

export interface PricingTableBlock {
  __component: "blocks.pricing-table";
  id: number;
  heading?: string | null;
  description?: string | null;
  tiers: PricingTierItem[];
  background: "default" | "muted" | "accent";
}

export type Block = /* …existing… */ | PricingTableBlock;
```

`packages/shared/src/schemas/blocks.ts` — the Zod schema is the FE's defence against
a CMS shape that drifted:

```ts
export const zPricingTable = z.object({
  __component: z.literal("blocks.pricing-table"),
  id: z.number(),
  heading: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tiers: z.array(zPricingTier),
  background: z.enum(["default", "muted", "accent"]).default("default"),
});
```

Match the JSON exactly: Strapi returns `null` (not `undefined`) for an empty
optional, so `.nullable().optional()` is the correct pair. `.optional()` alone
throws on `null`, which is the most common mistake here.

Then register it in the discriminated union the registry parses against, and rebuild:

```bash
pnpm --filter @vng/shared build   # Strapi consumes dist/index.cjs
```

## 4. React renderer

`apps/web/components/blocks/pricing-table.tsx`

```tsx
import type { PricingTableBlock } from "@vng/shared";
import { ActionLink } from "@/components/ui/action-link";
import { sectionBackground } from "./section-background";

/** Tiered pricing grid (§4.2). Server Component — no interactivity. */
export function PricingTable(block: PricingTableBlock) {
  return (
    <section className={sectionBackground(block.background)}>
      <div className="mx-auto max-w-6xl px-6">
        {block.heading && (
          <h2 className="text-display-sm font-bold text-balance">{block.heading}</h2>
        )}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {block.tiers.map((tier) => (
            <div key={tier.id} className="rounded-xl border border-border bg-card p-6">
              <h3 className="font-semibold">{tier.name}</h3>
              <p className="mt-2 text-display-xs">{tier.price}</p>
              {tier.cta && <ActionLink action={tier.cta} />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

Rules that matter:

- **Server Component unless it genuinely needs interactivity.** No `"use client"` on
  a block that only renders content — it pulls its whole subtree client-side and
  costs the §6.4 Lighthouse budget.
- **Import UI from `@vng/design-system`.** Don't hand-roll a Card or Button here.
- **Never `dangerouslySetInnerHTML`.** Rich text goes through
  `components/rich-text.tsx` (`blocks-react-renderer`), which produces React
  elements, not HTML.
- **CMS URLs go through `SmartLink`/`ActionLink`** (or `safeHref` directly). An
  editor-authored `javascript:` href is stored XSS otherwise — see
  `packages/shared/src/security/url.ts`.
- **Images** via `next/image` with explicit `sizes`; only the LCP element gets
  `priority`.
- Use `sectionBackground()` for the background enum so spacing and colour stay
  consistent across blocks.

## 5. Registry entry — the step that is actually load-bearing

`apps/web/components/blocks/registry.tsx`:

```tsx
import { PricingTable } from "./pricing-table";

const REGISTRY = {
  // …existing…
  "blocks.pricing-table": PricingTable,
} satisfies BlockRegistry;
```

The `satisfies` is what turns "I forgot the registry" from a silent blank section
into a type error, so keep it.

## 6. Seed + test

Add an instance to the seeded landing page in `apps/cms/src/bootstrap/seed.ts`, so
the block renders in the local stack and Lighthouse/Playwright actually exercise it.
Then, if the block has behaviour worth protecting, add an e2e spec in `qa/e2e/`.

## Verify

```bash
pnpm --filter @vng/shared build && pnpm typecheck && pnpm lint
docker compose up --build
```

1. Admin → the landing page → the block appears in the "Add a component" list.
2. Add it, fill it, **publish**, and confirm it renders on the FE within ~2 s with no
   rebuild.
3. Confirm it renders correctly in **both** locales and in dark + high-contrast
   themes.
4. `pnpm --filter @vng/qa lighthouse` — a block with an unoptimised image or a
   client-side dependency will show up as a CLS or TBT regression.

Related: `.claude/skills/design-system`, `.claude/skills/cms-strapi`.
