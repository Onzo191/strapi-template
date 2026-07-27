---
name: cms-strapi
description: Use when working in apps/cms — Strapi 5 content-types, schemas, controllers/services, seed data, plugins, or the editorial/audit workflow. Trigger words: Strapi, content-type, schema.json, seed, bootstrap, plugin, admin, collection, single-type, component, dynamic zone, lifecycle.
---

# Strapi 5 CMS (`apps/cms`)

- Strapi 5, TypeScript source in `src/`, runtime loads from `dist/`.
- Content shapes must stay in sync with the **Zod schemas in `@vng/shared`** that the web
  app parses — if you add/rename a field or a `blocks.*` component, update both sides.
- Seed logic lives in `src/bootstrap/seed.ts` (runs on bootstrap). Keep it idempotent.
- Editorial workflow + immutable audit log are a custom plugin (see recent commits).

## Gotchas (learned the hard way)

- **Schema JSON must ship to `dist`.** Strapi loads content-type/component schemas from
  the compiled `dist`, so `tsconfig` `include` must cover `src/**/*.json`, not just `.ts`.
  Missing JSON in dist = content-types silently absent at runtime.
- `@vng/shared` is **dual-build**: TS source for the web app, compiled **CJS `dist`** for
  the Strapi runtime. When you change shared contracts, rebuild shared so Strapi picks up
  the CJS output.

## Verify
`pnpm --filter @vng/cms build` (surfaces schema/dist issues), then typecheck.

Background: `docs/web-mng_details.md`, `docs/architecture_plan.md`.
