import { test, expect } from "@playwright/test";
import { signUp, uniqueEmail } from "./helpers/auth";

test("new accounts get the weekly digest by default and can turn it off", async ({ page }) => {
  // Mixed case on purpose: the hook must normalize it (better-auth may also lowercase it first; either way one row).
  await signUp(page, "Digest", uniqueEmail("DiGeSt"));
  await page.goto("/settings/notifications");

  const toggle = page.getByLabel(/weekly playoff-race digest/i);
  await expect(toggle).toBeChecked();

  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(page.getByLabel(/weekly playoff-race digest/i)).not.toBeChecked();
});
