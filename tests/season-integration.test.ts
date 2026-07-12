import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser, createStandardPool } from "./helpers/db";
import { createLeague } from "@/domain/leagues/create-league";
import { joinLeague } from "@/domain/leagues/join-league";
import { startDraft } from "@/domain/draft/start-draft";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { FakeStatsProvider } from "@/domain/stats/fake-provider";
import { buildMockWeek } from "@/domain/stats/mock-season";
import { syncWeekStats } from "@/domain/stats/sync-week";
import { getLeagueScores } from "@/lib/league-scores";
import { CURRENT_SEASON, PLAYOFF_WEEKS } from "@/domain/season";

describe("full mock season", () => {
  beforeEach(resetDb);

  it("draft → four synced weeks → stable, complete leaderboard", async () => {
    const commish = await createTestUser("Commish");
    const friend = await createTestUser("Friend");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "Season", teamName: "CT",
      scoringPreset: "half_ppr", pickClockHours: 8,
    });
    await joinLeague(testDb, { userId: friend.id, inviteCode: league.inviteCode, teamName: "FT" });
    await createStandardPool(2);
    // pool sync equivalence: give every player an externalId
    const players = await testDb.player.findMany();
    for (const p of players) {
      await testDb.player.update({ where: { id: p.id }, data: { externalId: `x-${p.id}` } });
    }
    await startDraft(testDb, { leagueId: league.id, userId: commish.id });
    for (let i = 0; i < 18; i++) {
      await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: i });
    }

    const mockPlayers = (await testDb.player.findMany()).map((p) => ({
      externalId: p.externalId!, name: p.name, position: p.position, nflTeam: p.nflTeam,
    }));
    for (const week of Object.values(PLAYOFF_WEEKS)) {
      const provider = new FakeStatsProvider(buildMockWeek(mockPlayers, CURRENT_SEASON, week));
      const result = await syncWeekStats(testDb, provider, { season: CURRENT_SEASON, week });
      expect(result.unmatched).toEqual([]);
    }

    const scores = await getLeagueScores(testDb, league.id);
    expect(scores.entries).toHaveLength(2);
    for (const entry of scores.entries) {
      expect(entry.weeks).toHaveLength(4);
      for (const week of entry.weeks) {
        expect(week.total).toBeGreaterThan(0);
        expect(week.lineup.filter((s) => s.playerId)).toHaveLength(9);
      }
      expect(entry.grandTotal).toBeCloseTo(
        entry.weeks.reduce((s, w) => s + w.total, 0),
        1,
      );
    }
    // deterministic: syncing the same mock week again changes nothing
    const before = JSON.stringify(scores);
    const provider = new FakeStatsProvider(buildMockWeek(mockPlayers, CURRENT_SEASON, 1));
    await syncWeekStats(testDb, provider, { season: CURRENT_SEASON, week: 1 });
    expect(JSON.stringify(await getLeagueScores(testDb, league.id))).toBe(before);
  });
});
