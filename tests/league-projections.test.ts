import { describe, it, expect, beforeEach } from "vitest";
import {
  testDb, resetDb, createTestUser, createStandardPool, setTestStat,
} from "./helpers/db";
import { createLeague } from "@/domain/leagues/create-league";
import { joinLeague } from "@/domain/leagues/join-league";
import { startDraft } from "@/domain/draft/start-draft";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { getLeagueProjections } from "@/lib/league-projections";
import { CURRENT_SEASON } from "@/domain/season";

describe("getLeagueProjections", () => {
  beforeEach(resetDb);

  it("ranks entries by projected optimal lineup EV; eliminated players contribute zero", async () => {
    const commish = await createTestUser("C");
    const friend = await createTestUser("F");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "L", teamName: "CT",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await joinLeague(testDb, { userId: friend.id, inviteCode: league.inviteCode, teamName: "FT" });
    await createStandardPool(2);
    await startDraft(testDb, { leagueId: league.id, userId: commish.id });
    for (let i = 0; i < 18; i++) {
      await autodraftCurrentPick(testDb, { leagueId: league.id, expectedPickIndex: i });
    }
    // week 1 stats so projections have data
    const picks = await testDb.draftPick.findMany();
    for (const p of picks) await setTestStat(p.playerId, 1, { rushYards: 100 });
    // week-2 odds: KC 70% (all test players are KC)
    await testDb.teamOdds.create({
      data: { season: CURRENT_SEASON, week: 2, team: "KC", opponent: "BUF", winProb: 0.7 },
    });
    // one scheduled week-2 game so week 2 is "next"
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON, week: 2, eventId: "g2", homeTeam: "KC", awayTeam: "BUF",
        startsAt: new Date(Date.now() + 24 * 3600 * 1000), state: "SCHEDULED",
      },
    });

    const proj = await getLeagueProjections(testDb, league.id);
    expect(proj.nextWeek).toBe(2);
    expect(proj.entries).toHaveLength(2);
    for (const e of proj.entries) {
      expect(e.projectedTotal).toBeGreaterThan(0);
      // every player: EV = projection × 0.7 (all KC, odds present, none eliminated)
      for (const p of e.players) {
        expect(p.winProb).toBe(0.7);
        expect(p.eliminated).toBe(false);
        expect(p.ev).toBeGreaterThan(0);
      }
    }
    // sorted desc by projectedTotal
    expect(proj.entries[0].projectedTotal).toBeGreaterThanOrEqual(proj.entries[1].projectedTotal);

    // eliminate KC → all EVs zero
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON, week: 1, eventId: "g1", homeTeam: "KC", awayTeam: "ZZZ",
        startsAt: new Date("2027-01-10T18:00:00Z"), state: "FINAL", homeScore: 3, awayScore: 30,
      },
    });
    const after = await getLeagueProjections(testDb, league.id);
    for (const e of after.entries) {
      expect(e.projectedTotal).toBe(0);
      for (const p of e.players) {
        expect(p.eliminated).toBe(true);
        expect(p.ev).toBe(0);
        expect(p.winProb).toBe(0);
      }
    }
  });

  it("returns no entries once every game this season is final", async () => {
    const commish = await createTestUser("C");
    const league = await createLeague(testDb, {
      userId: commish.id, name: "L", teamName: "CT",
      scoringPreset: "standard", pickClockHours: 8,
    });
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON, week: 4, eventId: "sb", homeTeam: "KC", awayTeam: "BUF",
        startsAt: new Date("2027-02-08T23:00:00Z"), state: "FINAL", homeScore: 31, awayScore: 20,
      },
    });
    const proj = await getLeagueProjections(testDb, league.id);
    expect(proj).toEqual({ nextWeek: null, entries: [] });
  });
});
