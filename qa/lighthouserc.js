const baseUrl = process.env.QA_BASE_URL ?? "http://localhost:3000";

/**
 * §6.4 budget: LCP < 2.5s, INP < 200ms, CLS < 0.1, and Performance/SEO/
 * Accessibility/Best-Practices >= 95. Runs against the same seeded stack as
 * Playwright (see playwright.config.ts) — `startServerCommand` is only set
 * locally; CI starts web/cms itself before invoking `lhci autorun`.
 *
 * Caveat: standard Lighthouse navigation-mode runs don't produce a real INP
 * sample (INP needs an actual user interaction / field data). `total-blocking-time`
 * is the closest lab-mode proxy for the <200ms budget — this is not literally
 * measuring INP, just the best available stand-in in a CI lab run.
 *
 * ## URL selection
 *
 * One URL per *page class* in §5.1, because each has a different rendering and
 * caching profile and they fail differently:
 *
 *   /vi, /en              static shell — both locales, because the VI font subset
 *                         carries diacritics and is heavier, so the LCP risk is
 *                         not symmetric between them
 *   /vi/tin-tuc           ISR list
 *   /vi/tin-tuc/<slug>    ISR detail — the highest-traffic class
 *   /vi/about             block-composed landing — the widest block mix, so the
 *                         most JS and images
 *   /vi/category/<slug>   ISR taxonomy feed
 *
 * `numberOfRuns: 3` plus lhci's median aggregation keeps one noisy run from
 * failing the gate.
 */
module.exports = {
  ci: {
    collect: {
      url: [
        `${baseUrl}/vi`,
        `${baseUrl}/en`,
        `${baseUrl}/vi/tin-tuc`,
        `${baseUrl}/vi/tin-tuc/vng-ra-mat-nen-tang-ai`,
        `${baseUrl}/vi/about`,
        `${baseUrl}/vi/category/cong-nghe`,
      ],
      numberOfRuns: 3,
      startServerCommand: process.env.CI ? undefined : "pnpm --filter @vng/web dev",
      startServerReadyPattern: process.env.CI ? undefined : "Ready in",
    },
    /**
     * ## Current state (measured 2026-07-29, local docker-compose stack)
     *
     * Two budgets FAIL, both deterministically. They are recorded here rather than
     * relaxed, because in both cases the budget is correctly detecting a real problem:
     *
     * | Budget         | /vi        | /vi/tin-tuc/<slug> | Verdict |
     * |----------------|------------|--------------------|---------|
     * | accessibility  | 100        | 96                 | PASS    |
     * | best-practices | 96         | 96                 | PASS    |
     * | CLS            | 0          | 0                  | PASS    |
     * | TBT            | 54 ms      | 27 ms              | PASS    |
     * | **seo**        | **91**     | **91**             | **FAIL** |
     * | **LCP**        | **3.67 s** | **3.54 s**         | **FAIL** |
     *
     * - **seo 91** is caused entirely by `meta-description`: metadata is emitted into
     *   `<body>` instead of `<head>` on every page. Root cause, evidence and candidate
     *   fixes are written up in `.claude/skills/seo-aio` — it also means `rel=canonical`
     *   is being ignored by Google, so it is a launch blocker, not a scoring quirk.
     * - **LCP** exceeds 2.5 s on the median run. Note this was measured against a local
     *   container under Lighthouse's default mobile throttling (4× CPU, slow 4G) — that
     *   is *not* staging, and it is not behind CloudFront. Re-measure against the real
     *   staging deployment before treating it as a code problem; the third run of each
     *   pair came in at 2.86 s / 2.66 s, so it is close to the line rather than far off.
     */
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 0.95 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],

        // P7 (§9): assert the security-relevant Best Practices audits
        // individually, so a header regression names itself in the CI log
        // instead of surfacing as a two-point score drop nobody investigates.
        //
        // `no-vulnerable-libraries` is deliberately absent: Lighthouse removed that
        // audit, and asserting an unknown audit id fails with "is not a known audit"
        // rather than being ignored. Dependency CVEs are covered by the lockfile audit
        // in CI, which is the right place for them anyway — it sees the whole tree, not
        // just what a page happens to load.
        deprecations: "error",

        // WARNING, not error, and deliberately so: `csp-xss` flags any
        // `script-src` containing `'unsafe-inline'`, which this app cannot avoid
        // while serving ISR-cached HTML — App Router inlines the RSC flight
        // payload, and a per-response nonce would force every page dynamic.
        // Making this an error would mean either permanently ignoring a red gate
        // or giving up ISR. See apps/web/lib/security-headers.ts and ADR-006.
        "csp-xss": "warn",

        // The local/CI stack is plain http, so this audit can never pass there;
        // TLS is asserted against staging by the header e2e spec instead.
        "is-on-https": "off",
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "./.lighthouseci",
    },
  },
};
