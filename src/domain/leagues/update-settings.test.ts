import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { upgradeLeaguePremium } from "./upgrade-league";
import { updateLeagueSettings } from "./update-settings";
import { parseLeagueSettings, SCORING_PRESETS } from "../league-settings";
import { NotCommissionerError, PremiumFeatureError } from "../errors";

async function setup() {
  const user = await createTestUser();
  const league = await createLeague(testDb, {
    userId: user.id, name: "L", teamName: "T",
    scoringPreset: "standard", pickClockHours: 8,
  });
  return { user, league };
}

describe("updateLeagueSettings", () => {
  beforeEach(resetDb);

  it("commissioner switches presets on a free league", async () => {
    const { user, league } = await setup();
    const updated = await updateLeagueSettings(testDb, {
      leagueId: league.id, userId: user.id, scoringPreset: "full_ppr",
    });
    const settings = parseLeagueSettings(updated.settings);
    expect(settings.scoringPreset).toBe("full_ppr");
    expect(settings.scoring.ppr).toBe(1);
  });

  it("custom scoring values require premium", async () => {
    const { user, league } = await setup();
    const custom = { ...SCORING_PRESETS.standard, passTd: 4 };
    await expect(
      updateLeagueSettings(testDb, { leagueId: league.id, userId: user.id, scoring: custom }),
    ).rejects.toThrow(PremiumFeatureError);

    await upgradeLeaguePremium(testDb, { leagueId: league.id });
    const updated = await updateLeagueSettings(testDb, {
      leagueId: league.id, userId: user.id, scoring: custom,
    });
    const settings = parseLeagueSettings(updated.settings);
    expect(settings.scoringPreset).toBe("custom");
    expect(settings.scoring.passTd).toBe(4);
    expect(settings.maxEntries).toBe(25); // untouched premium cap
  });

  it("saves dues config on any tier and clears with nulls", async () => {
    const { user, league } = await setup();
    let updated = await updateLeagueSettings(testDb, {
      leagueId: league.id, userId: user.id, entryFeeCents: 5000, venmoHandle: "nick-gerner",
    });
    let settings = parseLeagueSettings(updated.settings);
    expect(settings.entryFeeCents).toBe(5000);
    expect(settings.venmoHandle).toBe("nick-gerner");

    updated = await updateLeagueSettings(testDb, {
      leagueId: league.id, userId: user.id, entryFeeCents: null, venmoHandle: null,
    });
    settings = parseLeagueSettings(updated.settings);
    expect(settings.entryFeeCents).toBeNull();
    expect(settings.venmoHandle).toBeNull();
  });

  it("rejects non-commissioners", async () => {
    const { league } = await setup();
    const other = await createTestUser();
    await expect(
      updateLeagueSettings(testDb, {
        leagueId: league.id, userId: other.id, scoringPreset: "half_ppr",
      }),
    ).rejects.toThrow(NotCommissionerError);
  });
});
