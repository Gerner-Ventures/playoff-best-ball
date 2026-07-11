import { test, expect, type Page } from "@playwright/test";

async function signUp(page: Page, name: string, email: string) {
  const res = await page.request.post("/api/auth/sign-up/email", {
    data: { name, email, password: "e2e-password-123" },
  });
  expect(res.ok(), `sign-up failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

test.setTimeout(60_000);

test("commissioner starts draft, both users pick, board updates", async ({ browser }) => {
  const stamp = Date.now();
  const commishCtx = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const commish = await commishCtx.newPage();
  await signUp(commish, "Commish", `draft-commish-${stamp}@example.com`);

  // Create league + grab invite link
  await commish.goto("/leagues/new");
  await commish.getByPlaceholder("The Gerner Invitational").fill("Draft E2E League");
  await commish.getByPlaceholder("Team Nick").fill("Commish Team");
  await commish.getByRole("button", { name: "Create league" }).click();
  await expect(commish.getByRole("heading", { name: "Draft E2E League" })).toBeVisible();
  await commish.getByRole("button", { name: "Copy invite link" }).click();
  const inviteUrl: string = await commish.evaluate(() => navigator.clipboard.readText());

  // Second user joins
  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  await signUp(friend, "Friend", `draft-friend-${stamp}@example.com`);
  await friend.goto(inviteUrl);
  await friend.getByPlaceholder("Your team name").fill("Friend Team");
  await friend.getByRole("button", { name: "Join league" }).click();
  await expect(friend.getByText("Commish Team")).toBeVisible();

  // Reload commish league page so entryCount updates to 2 and Start draft becomes enabled
  await commish.reload();

  // Commissioner starts the draft — accept the confirm dialog
  commish.on("dialog", (d) => void d.accept());
  await commish.getByRole("button", { name: "Start draft" }).click();
  // Wait until the commish is on the draft room page (URL ends in /draft)
  await commish.waitForURL(/\/draft$/);
  await expect(commish.getByRole("heading", { name: /— Draft$/ })).toBeVisible();

  // Three picks — whoever is on the clock drafts the top available player
  const pages: Record<"commish" | "friend", Page> = { commish, friend };
  for (let i = 0; i < 3; i++) {
    await commish.reload();
    // Wait for the draft room to finish rendering before deciding whose turn it is
    await expect(commish.getByRole("heading", { name: /— Draft$/ })).toBeVisible();
    // Wait for the clock banner (either "You're on the clock" or "{name} is on the clock")
    // Use .first() to avoid strict-mode error when the board also has "on the clock" placeholder text
    await expect(commish.getByText(/on the clock/).first()).toBeVisible();

    const myTurnCommish = await commish
      .getByText("You're on the clock")
      .isVisible()
      .catch(() => false);
    const picker = myTurnCommish ? pages.commish : pages.friend;
    if (!myTurnCommish) {
      await friend.goto(commish.url());
      await expect(friend.getByText("You're on the clock")).toBeVisible();
    }
    const firstDraftButton = picker
      .getByRole("button", { name: "Draft", exact: true })
      .first();
    await expect(firstDraftButton).toBeEnabled();
    await firstDraftButton.click();
    // Confirm the pick landed on the board
    await expect
      .poll(() => picker.getByTestId("board-pick").count(), { timeout: 10_000 })
      .toBeGreaterThan(i);
  }

  await commishCtx.close();
  await friendCtx.close();
});
