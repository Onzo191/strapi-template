import { expect, test } from "@playwright/test";

test("contact form validates required fields, then submits", async ({ page }) => {
  await page.goto("/en/about");

  const submit = page.getByRole("button", { name: "Send" });
  await submit.scrollIntoViewIfNeeded();
  await submit.click();

  await expect(page.getByText("This field is required").first()).toBeVisible();

  await page.getByLabel("Full name").fill("Jane Doe");
  await page.getByLabel("Email").fill("jane@example.com");
  await page.getByLabel("Message").fill("Hello VNG!");
  await submit.click();

  await expect(page.getByText("Thanks for reaching out!")).toBeVisible();
});
