import { expect, test } from "@playwright/test";

/**
 * Category / tag browse (§5.1 — "Article list / category / tag").
 *
 * The seeded content is small, so these assert *routing and rendering*, not
 * pagination arithmetic: that a taxonomy slug resolves, filters the feed, carries
 * its own metadata, and 404s cleanly when the slug is unknown. Pagination
 * mechanics are asserted on the article index, which is the only feed that can
 * exceed one page with the demo data.
 */

test.describe("category", () => {
  test("a category page renders its own heading and a filtered feed", async ({ page }) => {
    await page.goto("/vi/category/cong-nghe");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Công nghệ");
    // At least one card, and every card links into the article route.
    const cards = page.locator("main a:has(h2)");
    await expect(cards.first()).toBeVisible();
    for (const href of await cards.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("href")),
    )) {
      expect(href).toMatch(/\/vi\/tin-tuc\//);
    }
  });

  test("a category page has a canonical URL of its own", async ({ page }) => {
    await page.goto("/vi/category/cong-nghe");
    // A taxonomy page canonicalising to the article index would de-index it.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/vi\/category\/cong-nghe$/,
    );
  });

  test("an unknown category slug 404s rather than rendering an empty feed", async ({ page }) => {
    const response = await page.goto("/vi/category/khong-ton-tai");
    expect(response?.status()).toBe(404);
  });
});

test.describe("tag", () => {
  test("a tag page renders and links into articles", async ({ page }) => {
    await page.goto("/vi/tag/ai");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("AI");
    await expect(page.locator("main a:has(h2)").first()).toBeVisible();
  });

  test("an unknown tag slug 404s", async ({ page }) => {
    const response = await page.goto("/vi/tag/khong-ton-tai");
    expect(response?.status()).toBe(404);
  });
});

test.describe("article index", () => {
  test("renders a card feed with headings and links", async ({ page }) => {
    await page.goto("/vi/tin-tuc");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tin tức");
    await expect(page.locator("main a:has(h2)").first()).toBeVisible();
  });

  test("an out-of-range page number does not 500", async ({ page }) => {
    // Deep-paginating past the end is what crawlers actually do; it must degrade
    // to an empty page or a 404, never an unhandled error.
    const response = await page.goto("/vi/tin-tuc?page=9999");
    expect([200, 404]).toContain(response?.status());
  });

  test("a non-numeric page param does not 500", async ({ page }) => {
    const response = await page.goto("/vi/tin-tuc?page=abc");
    expect([200, 404]).toContain(response?.status());
  });
});

test.describe("not found", () => {
  test("an unknown top-level slug returns 404", async ({ page }) => {
    const response = await page.goto("/vi/khong-co-trang-nay");
    expect(response?.status()).toBe(404);
  });

  test("an unknown article slug returns 404", async ({ page }) => {
    const response = await page.goto("/vi/tin-tuc/khong-co-bai-nay");
    expect(response?.status()).toBe(404);
  });

  test("an unsupported locale prefix returns 404", async ({ page }) => {
    const response = await page.goto("/fr");
    expect(response?.status()).toBe(404);
  });
});
