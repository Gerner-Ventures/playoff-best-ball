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
    expect(purchase!.amountCents).toBe(2500);
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
    expect(retry!.id).toBe(first!.id);
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

  it("P2002 race arbitration — pre-existing row returned without error (idempotent path)", async () => {
    const { user, league } = await setup();
    // Pre-create the purchase to simulate the concurrent winner.
    const preCreated = await testDb.leaguePurchase.create({
      data: {
        leagueId: league.id,
        purchasedById: user.id,
        stripeSessionId: "cs_race_1",
        amountCents: 2500,
      },
    });
    // Calling with the same sessionId should return the existing row without error.
    const result = await handleCheckoutCompleted(testDb, {
      sessionId: "cs_race_1", leagueId: league.id, userId: user.id, amountCents: 2500,
    });
    expect(result!.id).toBe(preCreated.id);
    expect(await testDb.leaguePurchase.count()).toBe(1);
  });

  it("refund-candidate path — duplicate premium purchase is recorded and league stays premium", async () => {
    const { user, league } = await setup();
    // First purchase: upgrades the league to PREMIUM.
    await handleCheckoutCompleted(testDb, {
      sessionId: "cs_first", leagueId: league.id, userId: user.id, amountCents: 2500,
    });
    // Second purchase with a DIFFERENT session id: league already premium — refund candidate.
    await handleCheckoutCompleted(testDb, {
      sessionId: "cs_duplicate", leagueId: league.id, userId: user.id, amountCents: 2500,
    });
    const updated = await testDb.league.findUniqueOrThrow({ where: { id: league.id } });
    expect(updated.tier).toBe("PREMIUM");
    expect(await testDb.leaguePurchase.count()).toBe(2);
  });

  it("nonexistent leagueId resolves null without creating a purchase row", async () => {
    const { user } = await setup();
    const result = await handleCheckoutCompleted(testDb, {
      sessionId: "cs_ghost", leagueId: "nonexistent-league-id", userId: user.id, amountCents: 2500,
    });
    expect(result).toBeNull();
    expect(await testDb.leaguePurchase.count()).toBe(0);
  });
});
