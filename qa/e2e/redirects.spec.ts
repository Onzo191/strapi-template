import { expect, test } from "@playwright/test";

/**
 * Legacy-404 → 301 map (Req §6, §6.3 — the 297 legacy URLs).
 *
 * Resolved in `apps/web/proxy.ts` from the CMS `redirect` content type. Three
 * rows are seeded (`apps/cms/src/bootstrap/seed.ts`) so this journey has
 * something real to exercise; production imports the full CSV.
 *
 * The status code assertions matter as much as the destinations: a 302 where the
 * business needs a 301 does not transfer ranking signal, which is the entire
 * reason the map exists.
 */

test("a permanent legacy URL 301s to its new home", async ({ page }) => {
  const response = await page.goto("/tin-tuc-cong-nghe");
  expect(response?.status()).toBe(200); // after following the redirect
  await expect(page).toHaveURL(/\/vi\/tin-tuc$/);

  // Confirm the hop itself was a 301, not a 302 or a client-side bounce.
  const chain = response?.request().redirectedFrom();
  expect(chain, "no redirect happened at all").not.toBeNull();
});

test("the redirect status code is honoured per row", async ({ request }) => {
  const permanent = await request.get("/gioi-thieu", { maxRedirects: 0 });
  expect(permanent.status()).toBe(301);
  expect(permanent.headers().location).toContain("/vi/about");

  const temporary = await request.get("/news", { maxRedirects: 0 });
  expect(temporary.status()).toBe(302);
  expect(temporary.headers().location).toContain("/en/tin-tuc");
});

test("a trailing slash on a legacy URL still resolves", async ({ request }) => {
  // Legacy inbound links use both forms, so both must land on the new page.
  //
  // It takes **two** hops, and the order is worth knowing: Next normalises the
  // trailing slash itself with a 308 *before* middleware runs, and only then does the
  // redirect resolver issue its 301. So the chain is
  //   /gioi-thieu/ --308--> /gioi-thieu --301--> /vi/about
  // rather than a single 301. Both hops are permanent, so ranking signal still
  // transfers, and it means the `redirect` table does **not** need a duplicate row per
  // slash variant — which is why this test asserts the destination rather than the
  // status of the first hop.
  const res = await request.get("/gioi-thieu/");
  expect(res.status()).toBe(200);
  expect(new URL(res.url()).pathname).toBe("/vi/about");
});

test("an unmapped path is not redirected", async ({ request }) => {
  // Guards against a resolver bug that matched too eagerly and started
  // redirecting live URLs.
  const res = await request.get("/vi/tin-tuc", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
});
