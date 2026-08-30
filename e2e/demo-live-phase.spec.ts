import { test, expect } from "@playwright/test";
import { signInAs, signUp, uniqueEmail } from "./helpers/auth";
import { readDemoSeed, demoLeague } from "./helpers/demo";
import { DEMO_LEAGUES } from "../src/domain/demo/fixtures";

// Exercises the live-playoffs phase against a real captured postseason. This is
// the spec that proves P0 end to end, and it is only possible because the demo
// seeder and the captured seasons exist — there was previously no way to reach
// this state at all.
//
// The demo world is shared and READ-ONLY here: these tests only read pages.

test.describe.configure({ mode: "serial" });

test.describe("live playoffs", () => {
  test("premium leaderboard shows real playoff scores for played weeks only", async ({ page }) => {
    const seed = readDemoSeed();
    const premium = demoLeague(seed, "PREMIUM");
    await signInAs(page, seed.personaEmail, seed.password);
    await page.goto(`/leagues/${premium.id}`);

    await expect(page.getByRole("heading", { name: "Standings" })).toBeVisible();

    // Scope to the standings table — team names also appear in the Teams section.
    const table = page.locator("table").first();
    await expect(table).toContainText("Gerner's Heroes");

    // All 12 teams are in the standings.
    await expect(table.locator("tbody tr")).toHaveCount(12);

    // Weeks 1-2 were played, 3-4 were not. The leaderboard renders all four
    // columns either way, so the em dashes are how "not yet played" shows up.
    await expect(table).toContainText("—");

    // A real score, not a placeholder: totals are decimals from actual box scores.
    await expect(table).toContainText(/\d+\.\d\d/);
  });

  test("premium projections render — the regression that motivated this work", async ({ page }) => {
    // getLeagueProjections derives nextWeek from games that are not FINAL. Before
    // the seeder wrote SCHEDULED rows for future weeks there were none, so
    // nextWeek came back null and this whole section rendered empty.
    const seed = readDemoSeed();
    const premium = demoLeague(seed, "PREMIUM");
    await signInAs(page, seed.personaEmail, seed.password);
    await page.goto(`/leagues/${premium.id}`);

    // Names the actual next round, which only resolves if nextWeek is non-null.
    await expect(page.getByText(/Projected Conference points/i)).toBeVisible();
    // And carries real numbers, not an empty list.
    await expect(page.getByText(/Projected Conference points/i).locator("..")).toContainText(
      /\d+\.\d/,
    );
  });

  test("free league shows the paywall instead of projections", async ({ page }) => {
    const seed = readDemoSeed();
    const free = demoLeague(seed, "FREE");
    await signInAs(page, seed.personaEmail, seed.password);
    await page.goto(`/leagues/${free.id}`);

    await expect(page.getByRole("heading", { name: "Standings" })).toBeVisible();
    await expect(page.getByText(/Included with Premium/i)).toBeVisible();
    await expect(page.getByText(/Projected Conference points/i)).toHaveCount(0);
  });

  test("dashboard lists both of the persona's leagues", async ({ page }) => {
    const seed = readDemoSeed();
    await signInAs(page, seed.personaEmail, seed.password);
    await page.goto("/dashboard");

    await expect(page.getByText(DEMO_LEAGUES.premium.name)).toBeVisible();
    await expect(page.getByText(DEMO_LEAGUES.free.name)).toBeVisible();
  });

  test("a league whose draft has run is closed to new teams", async ({ page }) => {
    // Must be someone who is NOT already a member: an existing member visiting
    // their own invite link is a rejoin, not a join, and is allowed.
    await signUp(page, "Latecomer", uniqueEmail("latecomer"));
    await page.goto(`/join/${DEMO_LEAGUES.premium.inviteCode}`);
    await expect(page.getByText(/already started/i)).toBeVisible();
  });
});
