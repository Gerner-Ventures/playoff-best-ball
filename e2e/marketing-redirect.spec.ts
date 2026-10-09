import { test, expect } from "@playwright/test";
import { signUp, uniqueEmail } from "./helpers/auth";

test("a signed-in visitor to / lands on the dashboard", async ({ page }) => {
  await signUp(page, "Home", uniqueEmail("home"));
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
});
