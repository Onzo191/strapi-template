import { expect, test } from "@playwright/test";

test("article list links through to a detail page", async ({ page }) => {
  await page.goto("/vi/tin-tuc");

  // Scope to a card link that actually contains a heading — the header nav links also carry
  // a `group` class (navigationMenuTriggerStyle), so a bare `a.group` would match those first.
  const firstCard = page.locator("main a:has(h2)").first();
  const title = await firstCard.locator("h2").innerText();
  await firstCard.click();

  await expect(page).toHaveURL(/\/vi\/tin-tuc\/.+/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
});
