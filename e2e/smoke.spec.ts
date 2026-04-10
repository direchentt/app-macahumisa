import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("muestra la pantalla de login con el título Macahumisa", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Macahumisa" })).toBeVisible();
  });
});
