import { test, expect } from "@playwright/test";
import { signUp } from "./helpers/auth";

test("saves phone + sms opt-in and persists across reload", async ({ page }) => {
  await signUp(page, "Notify", `notify-${Date.now()}@example.com`);
  await page.goto("/settings/notifications");
  await page.getByPlaceholder("+15555550123").fill("+15555550123");
  await page.getByLabel(/text me when i'm on the clock/i).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.reload();
  await expect(page.getByPlaceholder("+15555550123")).toHaveValue("+15555550123");
  await expect(page.getByLabel(/text me when i'm on the clock/i)).toBeChecked();
});

test("rejects a malformed phone number", async ({ page }) => {
  await signUp(page, "BadPhone", `badphone-${Date.now()}@example.com`);
  await page.goto("/settings/notifications");
  await page.getByPlaceholder("+15555550123").fill("555-1234");
  await page.getByRole("button", { name: "Save" }).click();
  // Match the API's exact rejection message, not /international format/: the field
  // label ("Phone number (international format)") also matches that, so the loose
  // regex passed whenever the error had not rendered yet — and passed vacuously
  // altogether while a hydration bug meant Save never fired at all.
  await expect(page.getByText("Use international format, e.g. +15555550123")).toBeVisible();
});
