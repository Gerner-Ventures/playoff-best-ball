import { test, expect } from "@playwright/test";
import { testDb, createTestUser } from "../tests/helpers/db";
import { createLeague } from "../src/domain/leagues/create-league";
import { formatDraftTime } from "../src/domain/leagues/invite-preview";
import { signUp, uniqueEmail } from "./helpers/auth";

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
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).not.toContain("Example"); // first name only, same as the page body
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  // og:image is absolute against metadataBase, which under `next dev` resolves to this
  // server's own local origin, not production; fetch the same path from this server either way.
  const img = await page.request.get(new URL(og!).pathname + new URL(og!).search);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");
});

test("an unknown invite code says so", async ({ page }) => {
  await page.goto("/join/ZZZZ9999");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/invite not found/i);
});

test("a signed-out existing member of a closed league can still find their way to sign in", async ({ page }) => {
  const commish = await createTestUser("Jordan Closed");
  const league = await createLeague(testDb, {
    userId: commish.id, name: `Jordan's League ${Date.now()}`, teamName: "JT",
    scoringPreset: "standard", pickClockHours: 8,
  });
  // Minimal Draft row marks the league as started; see invite-preview.test.ts.
  await testDb.draft.create({ data: { leagueId: league.id, order: [] } });

  await page.goto(`/join/${league.inviteCode}`);
  await expect(page.getByText(/closed to new teams/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /already in this league\? sign in/i })).toHaveAttribute(
    "href",
    `/sign-in?callbackURL=/join/${league.inviteCode}`,
  );
  // A started draft always shows "Started", never "Not scheduled yet" — the draft
  // row always has a null draftScheduledAt (startDraftForLeague clears it), so a
  // naive "no scheduled time" check would misreport a started draft as unscheduled.
  await expect(page.getByText("Not scheduled yet")).toHaveCount(0);
  await expect(page.getByText("Started", { exact: true })).toBeVisible();
});

test("a league with a future draft time shows its formatted schedule", async ({ page }) => {
  const commish = await createTestUser("Taylor Scheduled");
  const league = await createLeague(testDb, {
    userId: commish.id, name: `Taylor's League ${Date.now()}`, teamName: "TT",
    scoringPreset: "standard", pickClockHours: 8,
  });
  const draftScheduledAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  await testDb.league.update({ where: { id: league.id }, data: { draftScheduledAt } });

  await page.goto(`/join/${league.inviteCode}`);
  await expect(page.getByText(formatDraftTime(draftScheduledAt))).toBeVisible();
});

test("a signed-out visitor signs in and lands back on the join form", async ({ page }) => {
  const commish = await createTestUser("Morgan Signin");
  const league = await createLeague(testDb, {
    userId: commish.id, name: `Morgan's League ${Date.now()}`, teamName: "MT",
    scoringPreset: "standard", pickClockHours: 8,
  });

  await page.goto(`/join/${league.inviteCode}`);
  await page.getByRole("link", { name: /sign in to join/i }).click();
  await expect(page).toHaveURL(new RegExp(`/sign-in\\?callbackURL=`));

  await signUp(page, "Morgan Visitor", uniqueEmail("morgan-signin"));
  await page.goto(`/join/${league.inviteCode}`);
  await expect(page.getByRole("button", { name: /join league/i })).toBeVisible();
});

test("a full league shows the full message and a sign-in path, signed out", async ({ page }) => {
  const commish = await createTestUser("Casey Full");
  const league = await createLeague(testDb, {
    userId: commish.id, name: `Casey's Full League ${Date.now()}`, teamName: "CFT",
    scoringPreset: "standard", pickClockHours: 8,
  });
  const fresh = await testDb.league.findUniqueOrThrow({ where: { id: league.id } });
  const settings = fresh.settings as Record<string, unknown>;
  // The commissioner's own entry (created by createLeague) already fills maxEntries: 1.
  await testDb.league.update({
    where: { id: league.id },
    data: { settings: { ...settings, maxEntries: 1 } },
  });

  await page.goto(`/join/${league.inviteCode}`);
  await expect(page.getByText(/this league is full/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /already in this league\? sign in/i })).toHaveAttribute(
    "href",
    `/sign-in?callbackURL=/join/${league.inviteCode}`,
  );
});
