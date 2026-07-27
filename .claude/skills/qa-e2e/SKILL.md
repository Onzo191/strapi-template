---
name: qa-e2e
description: Use when writing or running end-to-end tests and quality gates — Playwright specs in qa/e2e, the Playwright config, and Lighthouse CI (performance/SEO/a11y budgets). Trigger words: Playwright, e2e, test spec, lighthouse, lighthouserc, performance budget, accessibility, CI check, playwright-report.
---

# QA — e2e & Lighthouse (`qa/`)

- Playwright lives in `qa/` (`qa/e2e`, `qa/playwright.config.ts`). Run via the qa package
  scripts. Reports land in `qa/playwright-report`.
- **Lighthouse CI**: `qa/lighthouserc.js` defines the perf/SEO/a11y budgets that gate CI —
  when adding pages, keep them within budget; changes here affect `.github/workflows/ci.yml`.
- Write specs against user-visible behavior and both locales (`/vi`, `/en`) where relevant.
- E2e needs web + CMS running; check the config for base URL and how services start.

## Verify
Run the Playwright suite locally before relying on CI; review the HTML report for failures.
