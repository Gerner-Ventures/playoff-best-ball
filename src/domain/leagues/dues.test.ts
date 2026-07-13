import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser } from "../../../tests/helpers/db";
import { createLeague } from "./create-league";
import { joinLeague } from "./join-league";
import { setDuesPaid, recordDuesInterest } from "./dues";
import { NotCommissionerError, NotLeagueMemberError } from "../errors";

async function setup() {
  const commish = await createTestUser("Commish");
  const friend = await createTestUser("Friend");
  const league = await createLeague(testDb, {
    userId: commish.id, name: "L", teamName: "CT",
    scoringPreset: "standard", pickClockHours: 8,
  });
  const entry = await joinLeague(testDb, {
    userId: friend.id, inviteCode: league.inviteCode, teamName: "FT",
  });
  return { commish, friend, league, entry };
}

describe("dues", () => {
  beforeEach(resetDb);

  it("commissioner toggles an entry's paid flag", async () => {
    const { commish, league, entry } = await setup();
    const updated = await setDuesPaid(testDb, {
      leagueId: league.id, userId: commish.id, entryId: entry.id, paid: true,
    });
    expect(updated.duesPaid).toBe(true);
    const back = await setDuesPaid(testDb, {
      leagueId: league.id, userId: commish.id, entryId: entry.id, paid: false,
    });
    expect(back.duesPaid).toBe(false);
  });

  it("rejects non-commissioners and cross-league entries", async () => {
    const { friend, league, entry } = await setup();
    await expect(
      setDuesPaid(testDb, { leagueId: league.id, userId: friend.id, entryId: entry.id, paid: true }),
    ).rejects.toThrow(NotCommissionerError);

    const other = await createTestUser("Other");
    const otherLeague = await createLeague(testDb, {
      userId: other.id, name: "L2", teamName: "OT",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await expect(
      setDuesPaid(testDb, {
        leagueId: otherLeague.id, userId: other.id, entryId: entry.id, paid: true,
      }),
    ).rejects.toThrow(/entry not in league/i);
  });

  it("records dues-collection interest once per member, reporting idempotent re-clicks", async () => {
    const { commish, league } = await setup();
    const first = await recordDuesInterest(testDb, { leagueId: league.id, userId: commish.id });
    expect(first.alreadyRecorded).toBe(false);
    const second = await recordDuesInterest(testDb, { leagueId: league.id, userId: commish.id });
    expect(second.alreadyRecorded).toBe(true);
    expect(await testDb.duesCollectionInterest.count()).toBe(1);
  });

  it("lets any league member record interest, not just the commissioner", async () => {
    const { friend, league } = await setup();
    const result = await recordDuesInterest(testDb, { leagueId: league.id, userId: friend.id });
    expect(result.alreadyRecorded).toBe(false);
    expect(await testDb.duesCollectionInterest.count()).toBe(1);
  });

  it("rejects non-members recording interest", async () => {
    const { league } = await setup();
    const outsider = await createTestUser("Outsider");
    await expect(
      recordDuesInterest(testDb, { leagueId: league.id, userId: outsider.id }),
    ).rejects.toThrow(NotLeagueMemberError);
    expect(await testDb.duesCollectionInterest.count()).toBe(0);
  });
});
