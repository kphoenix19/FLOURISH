import { expect, test } from "@playwright/test";

test("FLOURISH foundation loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FLOURISH" })).toBeVisible();
});
