import { test, expect, type Page } from "@playwright/test";

async function signUp(page: Page, name: string, email: string) {
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { name, email, password: "e2e-password-123" },
  });
  expect(res.ok(), `sign-up failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

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
  await expect(page.getByText(/international format/i)).toBeVisible();
});
