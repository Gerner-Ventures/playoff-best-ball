import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { handleCheckoutCompleted } from "./handle-checkout";
import { PREMIUM_MAX_ENTRIES } from "./upgrade-league";
import { parseLeagueSettings } from "../league-settings";

describe("handleCheckoutCompleted", () => {
  beforeEach(resetDb);

  async function setup() {
    const user = await createTestUser();
    const league = await createLeague(testDb, {
      userId: user.id, name: "L", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    return { user, league };
  }

  it("records the purchase and upgrades the league atomically", async () => {
    const { user, league } = await setup();
    const purchase = await handleCheckoutCompleted(testDb, {
      sessionId: "cs_test_1", leagueId: league.id, userId: user.id, amountCents: 2500,
    });
    expect(purchase.amountCents).toBe(2500);
    const updated = await testDb.league.findUniqueOrThrow({ where: { id: league.id } });
    expect(updated.tier).toBe("PREMIUM");
    expect(parseLeagueSettings(updated.settings).maxEntries).toBe(PREMIUM_MAX_ENTRIES);
  });

  it("is idempotent on webhook retries (same session id)", async () => {
    const { user, league } = await setup();
    const first = await handleCheckoutCompleted(testDb, {
      sessionId: "cs_test_1", leagueId: league.id, userId: user.id, amountCents: 2500,
    });
    const retry = await handleCheckoutCompleted(testDb, {
      sessionId: "cs_test_1", leagueId: league.id, userId: user.id, amountCents: 2500,
    });
    expect(retry.id).toBe(first.id);
    expect(await testDb.leaguePurchase.count()).toBe(1);
  });

  it("rejects sessions with missing league metadata", async () => {
    const { user } = await setup();
    await expect(
      handleCheckoutCompleted(testDb, {
        sessionId: "cs_test_2", leagueId: "", userId: user.id, amountCents: 2500,
      }),
    ).rejects.toThrow(/missing leagueId/i);
  });
});
