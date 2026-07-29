# ADR-004 — Editorial workflow + immutable audit on Community edition

- **Status:** Accepted
- **Date:** 2026-07 (P4), corrected at P7
- **Relates to:** plan §4.5, §4.6, assumption A5, Req §3/§4/§5

## Context

Req §3 makes a **Draft → Review → Approved → Published → Archived** workflow a
Must-have, with role-gated transitions across five roles (Master Admin, Admin, Editor,
Contributor, Viewer) and a rejection that carries a comment. Req §5 requires an
**exportable audit trail** of who did what, when.

Strapi's native **Review Workflows** implement most of this — and are an **Enterprise**
feature. The platform runs Strapi 5 **Community** (a hard constraint).

## Options

### Buy Strapi Enterprise

Cleanest technically: native workflows, native audit log, supported upgrades. Not
available as a decision at this point in the project (licensing and budget were
settled before implementation), so it is recorded as the option not taken rather than
one that was rejected on merit.

### Approximate it with Draft & Publish only

Use the built-in draft/published states and rely on process for review.

- Cheap. But there is no *approved* state, no enforced transition legality, no
  rejection comment, and no audit trail — so Req §3 and §5 are simply unmet. A review
  step that exists only as a convention is not a control.

### `contentStatus` enum + transition service + audit plugin (chosen)

- A `contentStatus` enum field on workflow-managed content types
  (`draft | review | approved | published | archived`).
- A **single transition service** as the only enforcement point: it validates that the
  transition is legal, checks the actor's role against the RBAC matrix, requires a
  comment on rejection, applies the Draft & Publish side effects, and writes exactly
  one audit row.
- An **immutable audit log** in the plugin's own table, append-only, with CSV/JSON
  export.
- Native Draft & Publish still backs the real published/unpublished state and
  scheduled publishing, so we are not reimplementing publication.

Cost: it is our code, including the RBAC matrix and the immutability guarantees, and
it will not be replaced automatically if the edition ever changes.

## Decision

Implement the workflow and audit log as a **custom local plugin**
(`apps/cms/src/plugins/editorial`), per the §4.6 ladder: cross-content-type, needs its
own admin UI, needs its own tables → a plugin, not inline code.

Enforcement invariants:

- **One transition path.** All state changes go through the transition service. A
  direct `contentStatus` write bypasses RBAC and the audit trail, so nothing else may
  set it.
- **Audit rows are append-only**, enforced by lifecycle hooks on the audit content
  type; the table is hidden from the content manager and the content-type builder.
- **Audit reads are role-gated too** (`auditRead` / `auditExport`). Added at P7: the
  log carries actor emails, rejection comments and the titles of unpublished work, so
  it doubles as a directory of who is working on what embargoed material.

## The P7 correction — worth recording

This plugin shipped **non-functional**, in a way that no test caught, and the reason
generalises.

1. Its `package.json` export map pointed `./strapi-server` at `strapi-server.ts`.
   Strapi resolves a local plugin's entrypoint from the **source** tree, and Node
   cannot `require` a `.ts` file in production. Strapi's plugin loader
   `continue`s past a *missing* entrypoint **silently** — no throw, no warning.
2. The plugin's *admin* half is resolved separately at build time by Vite, which reads
   TypeScript happily. So the admin panel rendered the "Editorial Workflow" and
   "Editorial Audit" menu items normally, while every request behind them 404'd.
3. And once the packaging was fixed, the plugin *still* would not boot: its audit
   content type declared an attribute named `documentId`, which Strapi reserves on
   every model. `transformContentTypesToModels` throws before the HTTP server starts.

Net effect before the fix: **no `editorial_audit_logs` table existed in any deployed
environment**, and a compliance requirement presented as "nobody has used the feature
yet". It was found by noticing the table was absent, not by anything failing.

Three changes prevent a recurrence:

- The server entrypoint is a hand-written CommonJS bridge
  (`src/plugins/<name>/strapi-server.js`) that forwards to the compiled tree, with the
  reasoning written into the file so the next person does not "tidy" it back to `.ts`.
- The audit attribute is `entryDocumentId`.
- `src/bootstrap/assert-plugins.ts` **fails the boot** if a required local plugin is
  absent from `strapi.plugins`. A packaging mistake now stops the container and fails
  the ECS health check instead of shipping a half-functional CMS.

The general lesson: *a silent skip in a loader is worse than a crash.* Where a
framework degrades quietly, assert loudly.

## Consequences

- The workflow and audit code is ours to maintain and to re-verify on Strapi upgrades.
- The RBAC matrix lives in one file (`constants/rbac.ts`) so role changes are a single
  edit, and it is shared by the transition service and the audit controller.
- Migrating to Enterprise Review Workflows later would mean a data migration from
  `contentStatus` to native workflow stages — feasible, but not free.

## Revisit if

- The project moves to Strapi Enterprise, at which point native Review Workflows plus
  the native audit log should replace this and the custom plugin should be retired
  rather than kept alongside.
