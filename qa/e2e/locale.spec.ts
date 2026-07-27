import { expect, test } from "@playwright/test";

test("locale switcher moves to the equivalent page in the other language", async ({
  page,
  isMobile,
}) => {
  await page.goto("/vi/tin-tuc");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tin tức");

  // Below `md`, the locale switcher only renders inside the mobile Sheet (see header.tsx) —
  // the desktop copy is hidden via `md:flex`.
  if (isMobile) {
    await page.getByRole("button", { name: "Open menu" }).click();
  }
  await page.getByRole("link", { name: "en", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/tin-tuc$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("News");
});
