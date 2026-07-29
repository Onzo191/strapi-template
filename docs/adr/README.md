# Architecture Decision Records

One file per decision that would be expensive to reverse. Each records the context,
the options considered, the call, and — most importantly — **what would make us
revisit it**.

Read the relevant ADR before overturning the decision it records. If you do overturn
one, supersede it with a new ADR rather than editing history.

001–005 are the set seeded by the architecture plan (§7). 006–007 were added during
the P7 hardening pass, when two decisions turned out to need their own record rather
than a paragraph inside 006.

| # | Decision | Status |
|---|---|---|
| [001](001-rendering-strategy.md) | Rendering: ISR + cache tags, not SSG or SSR | Accepted |
| [002](002-ui-base.md) | UI base: shadcn/ui + Tailwind v4, Astryx deferred | Accepted |
| [003](003-redis-cache-handler.md) | Redis-backed Next cache handler — mandatory, not optional | Accepted |
| [004](004-editorial-workflow-on-ce.md) | Editorial workflow + immutable audit on Community edition | Accepted |
| [005](005-monorepo-ci-change-detection.md) | Monorepo topology + change-detection CI | Accepted |
| [006](006-security-hardening.md) | Launch security posture (P7) | Accepted |
| [007](007-csp-without-nonces.md) | Static CSP without per-response nonces | Accepted |
