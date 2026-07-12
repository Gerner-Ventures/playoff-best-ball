import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { upgradeLeaguePremium, PREMIUM_MAX_ENTRIES } from "./upgrade-league";
import { parseLeagueSettings } from "../league-settings";

describe("upgradeLeaguePremium", () => {
  beforeEach(resetDb);

  it("flips tier and raises maxEntries", async () => {
    const user = await createTestUser();
    const league = await createLeague(testDb, {
      userId: user.id, name: "L", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    const upgraded = await upgradeLeaguePremium(testDb, { leagueId: league.id });
    expect(upgraded.tier).toBe("PREMIUM");
    expect(parseLeagueSettings(upgraded.settings).maxEntries).toBe(PREMIUM_MAX_ENTRIES);
  });

  it("is idempotent and never lowers a raised cap", async () => {
    const user = await createTestUser();
    const league = await createLeague(testDb, {
      userId: user.id, name: "L", teamName: "T",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await upgradeLeaguePremium(testDb, { leagueId: league.id });
    const again = await upgradeLeaguePremium(testDb, { leagueId: league.id });
    expect(again.tier).toBe("PREMIUM");
    expect(parseLeagueSettings(again.settings).maxEntries).toBe(PREMIUM_MAX_ENTRIES);
  });
});
