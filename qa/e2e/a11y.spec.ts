import { expect, test } from "@playwright/test";

/**
 * Accessibility smoke checks (§6.4 — the Lighthouse a11y budget is ≥95).
 *
 * Deliberately *complementary* to Lighthouse rather than a re-run of it:
 * Lighthouse audits a static snapshot, so it cannot see keyboard operability or
 * focus behaviour, which is where a Radix-based nav actually breaks. These cover
 * what a static audit structurally can't.
 */

test.describe("document structure", () => {
  for (const locale of ["vi", "en"] as const) {
    test(`landmarks and a single h1 (${locale})`, async ({ page }) => {
      await page.goto(`/${locale}`);

      await expect(page.locator("header")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("footer")).toHaveCount(1);

      // Exactly one h1 — multiple h1s break the document outline screen-reader
      // users navigate by, and Lighthouse's heading-order audit.
      await expect(page.locator("h1")).toHaveCount(1);
    });

    test(`html lang matches the route locale (${locale})`, async ({ page }) => {
      await page.goto(`/${locale}`);
      // Wrong `lang` makes a screen reader pronounce Vietnamese with English
      // phonetics — one attribute, very large impact.
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
    });
  }
});

test.describe("images and links", () => {
  test("every image has an alt attribute", async ({ page }) => {
    await page.goto("/vi");
    const missing = await page
      .locator("img")
      .evaluateAll((nodes) =>
        nodes.filter((n) => !n.hasAttribute("alt")).map((n) => n.getAttribute("src")),
      );
    expect(missing, `images without alt: ${missing.join(", ")}`).toHaveLength(0);
  });

  test("no link is left with an empty accessible name", async ({ page }) => {
    await page.goto("/vi");
    const unnamed = await page.locator("a").evaluateAll((nodes) =>
      nodes
        .filter((n) => {
          const text = (n.textContent ?? "").trim();
          const label = n.getAttribute("aria-label") ?? "";
          const title = n.getAttribute("title") ?? "";
          const hasImgAlt = Array.from(n.querySelectorAll("img")).some(
            (img) => (img.getAttribute("alt") ?? "").trim() !== "",
          );
          return !text && !label && !title && !hasImgAlt;
        })
        .map((n) => n.getAttribute("href") ?? "(no href)"),
    );
    expect(unnamed, `links with no accessible name: ${unnamed.join(", ")}`).toHaveLength(0);
  });

  test("external links carry rel=noopener", async ({ page }) => {
    await page.goto("/vi");
    const unsafe = await page
      .locator('a[target="_blank"]')
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => !(n.getAttribute("rel") ?? "").includes("noopener"))
          .map((n) => n.getAttribute("href") ?? ""),
      );
    expect(unsafe, `target=_blank without noopener: ${unsafe.join(", ")}`).toHaveLength(0);
  });
});

test.describe("keyboard operability", () => {
  test("the desktop nav dropdown opens from the keyboard", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop nav only");
    await page.goto("/vi");

    const trigger = page.getByRole("button", { name: "Về VNG" });
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("link", { name: "Giới thiệu" })).toBeVisible();
  });

  test("Escape closes the mobile nav and returns focus to the trigger", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "mobile nav only");
    await page.goto("/vi");

    const trigger = page.getByRole("button", { name: "Open menu" });
    await trigger.click();
    const navLink = page.getByRole("link", { name: "Tin tức", exact: true });
    await expect(navLink).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(navLink).toBeHidden();
    // Focus must come back to where it was, or a keyboard user is stranded at
    // the top of the document.
    await expect(trigger).toBeFocused();
  });

  test("tabbing reaches the first in-content link without a focus trap", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "keyboard tabbing is a desktop concern");
    await page.goto("/vi/tin-tuc");

    // Walk a bounded number of stops; if focus never enters <main> the header is
    // trapping it.
    let reachedMain = false;
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press("Tab");
      reachedMain = await page.evaluate(() => !!document.activeElement?.closest("main"));
      if (reachedMain) break;
    }
    expect(reachedMain, "focus never reached <main> within 40 tab stops").toBe(true);
  });
});

test.describe("reduced motion", () => {
  test("content is visible (not stuck at opacity 0) with prefers-reduced-motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/vi/tin-tuc");
    // `Reveal` short-circuits to a plain div under reduced motion; a regression
    // there leaves below-the-fold content invisible but present in the DOM,
    // which no snapshot test would catch.
    const card = page.locator("main a:has(h2)").first();
    await expect(card).toBeVisible();
    await expect(card).toHaveCSS("opacity", "1");
  });
});
