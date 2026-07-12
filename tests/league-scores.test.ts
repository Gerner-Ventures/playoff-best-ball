import { describe, it, expect, beforeEach } from "vitest";
import {
  testDb, resetDb, createTestUser, createTestPlayer, createStandardPool, setTestStat,
} from "./helpers/db";
import { createLeague } from "@/domain/leagues/create-league";
import { joinLeague } from "@/domain/leagues/join-league";
import { startDraft } from "@/domain/draft/start-draft";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { getLeagueScores } from "@/lib/league-scores";
import { PLAYOFF_WEEKS } from "@/domain/season";

describe("getLeagueScores", () => {
  beforeEach(resetDb);

  it("computes weekly optimal lineups and a sorted leaderboard", async () => {
    const commish = await createTestUser("Commish");
    const friend = await createTestUser("Friend");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "L", teamName: "CT",
      scoringPreset: "half_ppr", pickClockHours: 8,
    });
    await joinLeague(testDb, { userId: friend.id, inviteCode: league.inviteCode, teamName: "FT" });
    await createStandardPool(2);
    const entries = await testDb.entry.findMany({ where: { leagueId: league.id }, orderBy: { createdAt: "asc" } });
    await startDraft(testDb, {
      leagueId: league.id, userId: commish.id, order: entries.map((e) => e.id),
    });
    for (let i = 0; i < 18; i++) {
      await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: i });
    }

    // Give every drafted player 10 points of stats in week 1; give one of
    // entry-2's players a monster game so entry 2 leads.
    const picks = await testDb.draftPick.findMany({ include: { player: true } });
    for (const pick of picks) {
      await setTestStat(pick.playerId, PLAYOFF_WEEKS.WILD_CARD, { rushYards: 100 }); // 10 pts
    }
    const entry2Pick = picks.find((p) => p.entryId === entries[1].id && p.player.position === "RB")!;
    await setTestStat(entry2Pick.playerId, PLAYOFF_WEEKS.WILD_CARD, { rushYards: 300, rushTd: 3 }); // 48

    const scores = await getLeagueScores(testDb, league.id);
    expect(scores.entries).toHaveLength(2);
    expect(scores.entries[0].entryId).toBe(entries[1].id); // leader first
    expect(scores.entries[0].grandTotal).toBeGreaterThan(scores.entries[1].grandTotal);

    const week1 = scores.entries[0].weeks.find((w) => w.week === PLAYOFF_WEEKS.WILD_CARD)!;
    expect(week1.total).toBeCloseTo(week1.lineup.reduce((s, slot) => s + slot.points, 0));
    // 9 slots, all filled (every drafted player has stats)
    expect(week1.lineup.filter((s) => s.playerId !== null)).toHaveLength(9);
    // a week with no stats contributes zero
    const week3 = scores.entries[0].weeks.find((w) => w.week === PLAYOFF_WEEKS.CONFERENCE)!;
    expect(week3.total).toBe(0);
  });
});
