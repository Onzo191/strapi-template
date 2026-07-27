import { expect, test } from "@playwright/test";

test("desktop dropdown nav opens on click and shows children", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop nav only");
  await page.goto("/vi");

  const trigger = page.getByRole("button", { name: "Về VNG" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  await expect(page.getByRole("link", { name: "Giới thiệu" })).toBeVisible();
});

test("mobile sheet nav opens and closes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile nav only");
  await page.goto("/vi");

  await page.getByRole("button", { name: "Open menu" }).click();
  // `exact` matters: the seeded hero CTA link text ("Xem tin tức mới nhất") contains "Tin tức"
  // as a substring, and Playwright's default name match is substring-based.
  const navLink = page.getByRole("link", { name: "Tin tức", exact: true });
  await expect(navLink).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(navLink).toBeHidden();
});
