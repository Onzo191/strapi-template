import { expect, test } from "@playwright/test";

test("theme toggle switches and persists across reload", async ({ page }) => {
  await page.goto("/vi");

  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitem", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitem", { name: "High contrast" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "contrast");
});

test("page still renders correctly with prefers-reduced-motion set", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/vi");
  // `Reveal` (packages/design-system/src/motion/reveal.tsx) short-circuits to a plain,
  // un-animated `<div>` under reduced motion — this is a smoke check that the below-the-fold
  // blocks it wraps still render (not a fade-stuck-at-opacity-0 regression).
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "VNG trong những con số" })).toBeVisible();
});
