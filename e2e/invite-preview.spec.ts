import { test, expect } from "@playwright/test";
import { testDb, createTestUser } from "../tests/helpers/db";
import { createLeague } from "../src/domain/leagues/create-league";

test("a signed-out invite link shows the league and previews richly", async ({ page }) => {
  const commish = await createTestUser("Robin Example");
  const league = await createLeague(testDb, {
    userId: commish.id, name: `Robin's League ${Date.now()}`, teamName: "RT",
    scoringPreset: "standard", pickClockHours: 8,
  });

  await page.goto(`/join/${league.inviteCode}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(league.name);
  await expect(page.getByText(/Robin is running/)).toBeVisible();
  await expect(page.getByText("Example")).toHaveCount(0); // first name only
  await expect(page.getByRole("link", { name: /sign in to join/i })).toHaveAttribute(
    "href",
    `/sign-in?callbackURL=/join/${league.inviteCode}`,
  );

  await expect(page).toHaveTitle(`You're invited to ${league.name}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  const img = await page.request.get(new URL(og!).pathname + new URL(og!).search);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");
});

test("an unknown invite code says so", async ({ page }) => {
  await page.goto("/join/ZZZZ9999");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/invite not found/i);
});
