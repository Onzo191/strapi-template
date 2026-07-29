import { expect, test } from "@playwright/test";

/**
 * SEO/AIO critical journey (§6.3, P4 DoD).
 *
 * SEO is a *first-class requirement* here, not a nice-to-have — the whole point
 * of P4 — and it is uniquely prone to silent regression: a `generateMetadata`
 * refactor that drops `alternates` breaks hreflang with no visible change to the
 * page and no failing test anywhere else. These assertions are the tripwire.
 */

/**
 * Note on selectors: metadata is asserted **document-wide** (`link[rel="canonical"]`),
 * not scoped to `head`. Next 16 / React 19 stream metadata tags *after* `</head>` and
 * rely on React hoisting them into `<head>` in the DOM, so a `head link[…]` selector
 * races hydration and fails against the server markup. Crawlers parse the document, so
 * document-wide is also the assertion that matches what actually matters.
 */

const ARTICLE_SLUG = "vng-ra-mat-nen-tang-ai";

test.describe("page metadata", () => {
  test("article detail emits title, description, canonical and OG tags", async ({ page }) => {
    await page.goto(`/vi/tin-tuc/${ARTICLE_SLUG}`);

    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    // Canonical must be absolute — a relative canonical is ignored by crawlers,
    // and getting it wrong is the www/non-www duplication problem in §6.3.
    await expect(canonical).toHaveAttribute("href", /^https?:\/\/.+\/vi\/tin-tuc\//);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:type"]')).toHaveCount(1);
  });

  test("hreflang alternates link vi ↔ en both ways", async ({ page }) => {
    await page.goto(`/vi/tin-tuc/${ARTICLE_SLUG}`);

    const alternates = page.locator('link[rel="alternate"][hreflang]');
    const langs = await alternates.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("hreflang")),
    );
    expect(langs).toContain("vi");
    expect(langs).toContain("en");

    // The en alternate must actually resolve, not 404 — a dangling hreflang is
    // worse than none (Search Console flags it as an error).
    const enHref = await page.locator('link[rel="alternate"][hreflang="en"]').getAttribute("href");
    expect(enHref).toBeTruthy();
    const res = await page.request.get(enHref as string);
    expect(res.status()).toBe(200);
  });

  test("article carries NewsArticle and Breadcrumb JSON-LD that parses", async ({ page }) => {
    await page.goto(`/vi/tin-tuc/${ARTICLE_SLUG}`);

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((n) => n.textContent ?? ""));
    expect(blocks.length).toBeGreaterThan(0);

    // Every block must be valid JSON. This is the assertion that catches the
    // `</script>`-breakout class of bug: an unescaped CMS string would either
    // split the block or leave it unparseable.
    const parsed = blocks.map((raw) => JSON.parse(raw) as { "@type"?: string });
    const types = parsed.map((node) => node["@type"]);
    expect(types).toContain("NewsArticle");
    expect(types).toContain("BreadcrumbList");
  });

  test("home page carries Organization JSON-LD", async ({ page }) => {
    await page.goto("/vi");
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((n) => n.textContent ?? ""));
    const types = blocks.map((raw) => (JSON.parse(raw) as { "@type"?: string })["@type"]);
    expect(types).toContain("Organization");
  });
});

test.describe("sitemap and robots", () => {
  test("sitemap.xml is valid XML, lists both locales and no duplicate URLs", async ({
    request,
  }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("xml");

    const xml = await res.text();
    expect(xml).toContain("<urlset");
    expect(xml).toContain("/vi/tin-tuc/");
    expect(xml).toContain("/en/");

    // Duplicates would split ranking signals between identical URLs.
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    expect(new Set(urls).size).toBe(urls.length);

    // Every entry must be absolute; a relative <loc> makes the whole sitemap
    // invalid to crawlers.
    for (const url of urls) {
      expect(url, `non-absolute sitemap entry: ${url}`).toMatch(/^https?:\/\//);
    }
  });

  test("robots.txt points at the sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/user-agent:/i);
    expect(body).toMatch(/sitemap:\s*https?:\/\//i);
  });
});
