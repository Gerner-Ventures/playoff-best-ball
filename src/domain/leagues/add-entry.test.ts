import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser, createStandardPool } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { upgradeLeaguePremium } from "./upgrade-league";
import { addEntry } from "./add-entry";
import { startDraft } from "../draft/start-draft";
import { PremiumFeatureError, DraftAlreadyStartedError, NotLeagueMemberError } from "../errors";

describe("addEntry", () => {
  beforeEach(resetDb);

  async function setup(premium: boolean) {
    const user = await createTestUser();
    const league = await createLeague(testDb, {
      userId: user.id, name: "L", teamName: "First Team",
      scoringPreset: "standard", pickClockHours: 8,
    });
    if (premium) await upgradeLeaguePremium(testDb, { leagueId: league.id });
    return { user, league };
  }

  it("members of premium leagues add extra entries", async () => {
    const { user, league } = await setup(true);
    const entry = await addEntry(testDb, {
      leagueId: league.id, userId: user.id, teamName: "Second Team",
    });
    expect(entry.name).toBe("Second Team");
    expect(await testDb.entry.count({ where: { leagueId: league.id } })).toBe(2);
  });

  it("rejects on free leagues, for non-members, and once the draft exists", async () => {
    const { league } = await setup(false);
    const owner = await testDb.membership.findFirstOrThrow({ where: { leagueId: league.id } });
    await expect(
      addEntry(testDb, { leagueId: league.id, userId: owner.userId, teamName: "Nope" }),
    ).rejects.toThrow(PremiumFeatureError);

    const { user: pUser, league: pLeague } = await setup(true);
    const outsider = await createTestUser("Outsider");
    await expect(
      addEntry(testDb, { leagueId: pLeague.id, userId: outsider.id, teamName: "Nope" }),
    ).rejects.toThrow(NotLeagueMemberError);

    // start a draft (needs 2 entries + pool) then reject
    await addEntry(testDb, { leagueId: pLeague.id, userId: pUser.id, teamName: "Second" });
    await createStandardPool(2);
    await startDraft(testDb, { leagueId: pLeague.id, userId: pUser.id });
    await expect(
      addEntry(testDb, { leagueId: pLeague.id, userId: pUser.id, teamName: "Third" }),
    ).rejects.toThrow(DraftAlreadyStartedError);
  });
});
