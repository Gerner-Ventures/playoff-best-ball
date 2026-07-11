import { test, expect, type Page } from "@playwright/test";

async function signUp(page: Page, name: string, email: string) {
  // E2E_TEST_MODE enables the email/password endpoint; create the session via API,
  // cookies land on the page's context.
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { name, email, password: "e2e-password-123" },
  });
  expect(res.ok()).toBeTruthy();
}

test("create league, invite, join", async ({ browser }) => {
  const commishCtx = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const commish = await commishCtx.newPage();
  await signUp(commish, "Commish", `commish-${Date.now()}@example.com`);

  // Create league
  await commish.goto("/leagues/new");
  await commish.getByPlaceholder("The Gerner Invitational").fill("E2E League");
  await commish.getByPlaceholder("Team Nick").fill("Commish Team");
  await commish.getByRole("button", { name: "Create league" }).click();
  await expect(commish.getByRole("heading", { name: "E2E League" })).toBeVisible();

  // Grab invite link
  await commish.getByRole("button", { name: "Copy invite link" }).click();
  const inviteUrl: string = await commish.evaluate(() => navigator.clipboard.readText());
  expect(inviteUrl).toContain("/join/");

  // Second user joins
  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  await signUp(friend, "Friend", `friend-${Date.now()}@example.com`);
  await friend.goto(inviteUrl);
  await friend.getByPlaceholder("Your team name").fill("Friend Team");
  await friend.getByRole("button", { name: "Join league" }).click();

  // Both teams visible
  await expect(friend.getByText("Commish Team")).toBeVisible();
  await expect(friend.getByText("Friend Team")).toBeVisible();

  await commishCtx.close();
  await friendCtx.close();
});
