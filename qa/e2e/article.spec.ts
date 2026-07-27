import { expect, test } from "@playwright/test";

test("article list links through to a detail page", async ({ page }) => {
  await page.goto("/vi/tin-tuc");

  // `.group` is the article card's own marker class (see article-card.tsx) — robust to
  // whether its title renders as `h2` (list pages) or `h3` (nested under a block heading).
  const firstCard = page.locator("a.group").first();
  const title = await firstCard.locator("h2, h3").innerText();
  await firstCard.click();

  await expect(page).toHaveURL(/\/vi\/tin-tuc\/.+/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
});
