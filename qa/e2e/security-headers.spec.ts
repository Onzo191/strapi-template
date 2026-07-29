import { expect, type Response, test } from "@playwright/test";

/**
 * Asserts the P7 security header set (§9) is actually on the wire.
 *
 * This runs against the built app rather than unit-testing `buildSecurityHeaders`
 * because the failure mode being guarded is *delivery*, not construction: a
 * `headers()` entry whose `source` pattern stops matching, a CloudFront behaviour
 * that strips a header, or a `next.config.ts` refactor that drops the block. The
 * builder's own logic is covered by asserting the values here too.
 */

const CRITICAL_HEADERS: Array<[string, string | RegExp]> = [
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["x-frame-options", "DENY"],
  ["cross-origin-opener-policy", "same-origin"],
  ["x-permitted-cross-domain-policies", "none"],
  ["permissions-policy", /camera=\(\)/],
];

async function headersOf(response: Response | null): Promise<Record<string, string>> {
  expect(response, "navigation returned no response").not.toBeNull();
  return (response as Response).headers();
}

test.describe("security headers", () => {
  test("every critical header is present on a page response", async ({ page }) => {
    const headers = await headersOf(await page.goto("/vi"));
    for (const [name, expected] of CRITICAL_HEADERS) {
      const value = headers[name];
      expect(value, `missing header ${name}`).toBeTruthy();
      if (typeof expected === "string") {
        expect(value).toBe(expected);
      } else {
        expect(value).toMatch(expected);
      }
    }
  });

  test("CSP is present and locks down the dangerous sinks", async ({ page }) => {
    const headers = await headersOf(await page.goto("/vi"));
    const csp =
      headers["content-security-policy"] ?? headers["content-security-policy-report-only"];
    expect(csp, "no CSP header").toBeTruthy();

    // These four are the directives that matter most for a CMS-driven site: they
    // are what still contain an injection even though `script-src` has to keep
    // `'unsafe-inline'` for App Router's inline flight data (see
    // apps/web/lib/security-headers.ts for why a nonce is not reachable here).
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");

    // Never in a built app — that would mean the dev branch leaked into prod.
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test("the framework version is not advertised", async ({ page }) => {
    const headers = await headersOf(await page.goto("/vi"));
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("API routes are marked no-store", async ({ request }) => {
    // A cached 200 from /api/revalidate would silently swallow real cache
    // invalidations; a cached preview redirect would hand draft access to the
    // next visitor through a shared proxy.
    const res = await request.post("/api/revalidate", {
      data: { model: "article" },
      failOnStatusCode: false,
    });
    expect(res.headers()["cache-control"]).toContain("no-store");
  });
});

test.describe("unauthenticated endpoint hardening", () => {
  test("revalidate rejects an unsigned request", async ({ request }) => {
    const res = await request.post("/api/revalidate", {
      data: { model: "article", slug: "x", locale: "vi" },
      failOnStatusCode: false,
    });
    // 401 (no signature/timestamp) — never 200, and never a 500 that would leak
    // a stack trace.
    expect(res.status()).toBe(401);
  });

  test("revalidate rejects a correctly-shaped but unsigned payload", async ({ request }) => {
    const res = await request.post("/api/revalidate", {
      headers: {
        "x-vng-signature": `sha256=${"0".repeat(64)}`,
        "x-vng-timestamp": String(Math.floor(Date.now() / 1000)),
      },
      data: { model: "article" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test("preview rejects a wrong secret", async ({ request }) => {
    const res = await request.get("/api/preview?secret=wrong&url=/vi", {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    // 401 when preview is configured, 404 when it isn't. Never a redirect —
    // that would mean draftMode was enabled without a valid secret.
    expect([401, 404]).toContain(res.status());
  });

  test("preview will not redirect off-origin even with no secret configured", async ({
    request,
  }) => {
    const res = await request.get("/api/preview?secret=wrong&url=https://example.com", {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    expect(res.status()).not.toBe(307);
    expect(res.status()).not.toBe(302);
  });

  test("preview exit will not become an open redirect", async ({ request }) => {
    // Unauthenticated by design (leaving preview is not privileged), so the
    // destination check is the only control.
    const res = await request.get("/api/preview/exit?url=https://example.com", {
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    const location = res.headers().location ?? "";
    expect(location).not.toContain("example.com");
  });
});

test.describe("health probe", () => {
  test("/api/health is 200 and no-store", async ({ request }) => {
    // The Dockerfile HEALTHCHECK and the ECS/ALB target group both probe this path.
    // When it 404s, every task reports unhealthy and an ECS deployment never
    // stabilises — a launch blocker that is invisible from the browser.
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("the health probe does not leak build or version detail", async ({ request }) => {
    // Reachable through the ALB, so the body must stay minimal.
    const body = await (await request.get("/api/health")).text();
    expect(body).not.toMatch(/version|commit|build|node|next/i);
  });
});
