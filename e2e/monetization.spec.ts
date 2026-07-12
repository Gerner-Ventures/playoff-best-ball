import { test, expect, type Page } from "@playwright/test";

async function signUp(page: Page, name: string, email: string) {
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { name, email, password: "e2e-password-123" },
  });
  expect(res.ok(), `sign-up failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

async function createLeague(page: Page, name: string) {
  await page.goto("/leagues/new");
  await page.getByPlaceholder("The Gerner Invitational").fill(name);
  await page.getByPlaceholder("Team Nick").fill("Commish Team");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("settings: dues config, premium upsell, fake-door waitlist", async ({ page }) => {
  const stamp = Date.now();
  await signUp(page, "Commish", `mon-commish-${stamp}@example.com`);
  await createLeague(page, "Monetization League");

  await page.getByRole("main").getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "League settings" })).toBeVisible();

  // free tier: custom grid disabled + upsell copy + upgrade button present
  await expect(page.getByText("Editing individual values is a Premium feature")).toBeVisible();
  await expect(page.getByRole("button", { name: /Upgrade to Premium/ })).toBeVisible();

  // dues config saves
  await page.getByLabel("Entry fee ($)").fill("50");
  await page.getByLabel("Venmo handle").fill("test-commish");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // fake door
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByText("You're on the waitlist.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("You're on the waitlist.")).toBeVisible(); // persisted

  // league page shows the dues panel with the venmo link
  await page.goto(page.url().replace("/settings", ""));
  await expect(page.getByText("$50 per team")).toBeVisible();
  await expect(page.getByRole("link", { name: "pay @test-commish on Venmo" })).toBeVisible();

  // commissioner marks own entry paid
  await page.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByRole("button", { name: "Paid ✓" })).toBeVisible();
});
