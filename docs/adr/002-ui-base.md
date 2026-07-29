# ADR-002 — UI base: shadcn/ui + Tailwind v4; Astryx deferred

- **Status:** Accepted
- **Date:** 2026-07 (P0/P5)
- **Relates to:** plan §2, §6.1

## Context

The design system needs to support a "solid minimalism" visual direction, light/dark
plus named themes, VI/EN typography (Vietnamese diacritics), a ≥95 Lighthouse
accessibility score, and a page-builder block library that non-technical editors
compose from. It has to be production-ready for a **fixed launch date** and pass a
**mandatory security review**.

Two candidates were evaluated.

## Options

### shadcn/ui + Radix + Tailwind v4 (chosen)

Components are *copied into* `packages/design-system` rather than installed.

- **You own the source.** For a security review this is the deciding property: every
  component is auditable in-repo, and a fix does not wait on an upstream release.
- Radix primitives bring keyboard and ARIA behaviour that is genuinely hard to get
  right by hand — the focus management in the nav dropdown and mobile sheet is most of
  the a11y budget.
- Tailwind is already familiar to the team, so no ramp-up against a fixed date.
- Theming via CSS custom properties + `next-themes` is enough for light/dark/contrast
  and any campaign theme.
- Cost: owning the source means owning the maintenance; upstream improvements must be
  ported deliberately.

### Astryx (deferred)

- Genuinely better on two axes we care about: **native CLI + MCP server** for
  AI-agent-driven component generation, and stronger built-in multi-theme tokens.
- **Beta.** For a fixed-date production launch of a corporate flagship site, a beta UI
  foundation is the wrong risk to take: a breaking change or an unfixed accessibility
  bug lands during UAT with no recourse. Peer-dependency churn compounds it.
- StyleX is a steeper learning curve than Tailwind, spending schedule the project
  does not have.

## Decision

**shadcn/ui + Radix + Tailwind v4** as the primary and only component system.

The AI-agent ergonomics that Astryx would have given us are captured ourselves
instead, and this is the part worth being explicit about: `.claude/skills/*` recipes
(notably `add-page-builder-block` and `add-theme`), a typed block registry with
`satisfies` so a missing registration is a compile error, and `components.json` for
shadcn's own CLI. That covers the actual need — agents adding blocks correctly —
without taking on beta risk.

Running **two** component systems is explicitly out of scope.

## Consequences

- `packages/design-system` is ours to maintain, including a11y regressions. Mitigated
  by `qa/e2e/a11y.spec.ts` covering keyboard and focus behaviour that Lighthouse's
  static audit structurally cannot see.
- Tailwind v4 is recent; it is pinned and a major bump requires an ADR.
- Theming is token-set-based, so adding a theme touches CSS variables and a registry,
  never component code (`.claude/skills/add-theme`).

## Revisit if

- Astryx reaches a stable release **and** the 2027 multi-site phase makes its
  multi-theme tokens and MCP component generation worth a migration. That is the
  natural re-evaluation point: a new site is a place to trial it without touching
  vng.com.vn.
- Radix or Tailwind ship a breaking change severe enough to force a foundation
  decision anyway.
