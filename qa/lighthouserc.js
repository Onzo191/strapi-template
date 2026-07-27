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
      ],
      numberOfRuns: 3,
      startServerCommand: process.env.CI ? undefined : "pnpm --filter @vng/web dev",
      startServerReadyPattern: process.env.CI ? undefined : "Ready in",
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 0.95 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "./.lighthouseci",
    },
  },
};
