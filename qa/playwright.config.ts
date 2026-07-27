import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.QA_BASE_URL ?? "http://localhost:3000";

/**
 * Runs against the same stack `docker-compose.yml` describes (postgres + redis + cms + web,
 * seeded content) — the CMS-down fallback (`loadResilient`) means an unseeded web app renders
 * empty/`notFound()` pages, so these specs need real content behind them, not a bare `next dev`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Chromium-based mobile emulation rather than a WebKit device preset — the
    // mobile-nav tests only need a narrow viewport (they assert CSS-breakpoint-
    // driven visibility, not Safari-specific rendering), and WebKit's install is
    // known to be flaky/frozen on some CI/sandboxed host OS versions.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // CI starts `web` itself (see .github/workflows/ci.yml) so it can also start `cms`/postgres/redis
  // first — Playwright's own `webServer` only knows how to run one process, not the full stack.
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm --filter @vng/web dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
