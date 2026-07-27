import { expect, test } from "@playwright/test";

for (const locale of ["vi", "en"] as const) {
  test(`home page renders (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}`);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
  });
}
