import { describe, it, expect, beforeEach } from "vitest";
import {
  testDb, resetDb, createTestUser, createTestPlayer, createStandardPool, setTestStat,
} from "./helpers/db";
import { createLeague } from "@/domain/leagues/create-league";
import { joinLeague } from "@/domain/leagues/join-league";
import { updateLeagueSettings } from "@/domain/leagues/update-settings";
import { setSubstitution } from "@/domain/leagues/substitutions";
import { startDraft } from "@/domain/draft/start-draft";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { getLeagueScores } from "@/lib/league-scores";
import { CURRENT_SEASON, PLAYOFF_WEEKS } from "@/domain/season";

/** Two-entry league, fully drafted from a standard pool. */
async function setupDraftedLeague() {
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
  return { commish, friend, league, entries };
}

describe("getLeagueScores", () => {
  beforeEach(resetDb);

  it("computes weekly optimal lineups and a sorted leaderboard", async () => {
    const { league, entries } = await setupDraftedLeague();

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

    // elimination flows through: no FINAL games yet → everyone alive, no slot flagged
    expect(scores.rosterSize).toBe(9);
    expect(scores.entries.every((e) => e.alivePlayers === 9)).toBe(true);
    expect(week1.lineup.every((s) => s.teamEliminated === false)).toBe(true);

    // the test helper gives every player nflTeam "KC" — a FINAL game where KC
    // loses eliminates every rostered player for every entry
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON, week: 1, eventId: "elim-1",
        homeTeam: "KC", awayTeam: "ZZZ",
        startsAt: new Date("2027-01-10T18:00:00Z"), state: "FINAL",
        homeScore: 10, awayScore: 20,
      },
    });
    const withElim = await getLeagueScores(testDb, league.id);
    const leader = withElim.entries.find((e) => e.entryId === entries[1].id)!;
    expect(leader.alivePlayers).toBe(0);
    const monsterSlot = leader.weeks
      .find((w) => w.week === PLAYOFF_WEEKS.WILD_CARD)!
      .lineup.find((s) => s.playerId === entry2Pick.playerId)!;
    expect(monsterSlot.teamEliminated).toBe(true);
  });

  it("substitutions split scoring at the effective week", async () => {
    const { commish, league, entries } = await setupDraftedLeague();
    const pick = await testDb.draftPick.findFirstOrThrow({
      where: { entryId: entries[0].id }, include: { player: true },
    });
    const sub = await createTestPlayer(pick.player.position, { name: "The Sub" });
    await updateLeagueSettings(testDb, {
      leagueId: league.id, userId: commish.id, substitutionsEnabled: true,
    });
    await setSubstitution(testDb, {
      leagueId: league.id, userId: commish.id, entryId: entries[0].id,
      originalPlayerId: pick.playerId, substitutePlayerId: sub.id, effectiveWeek: 2,
    });
    // original scores 10 in week 1 AND (irrelevantly) 50 in week 2; sub scores 20 in week 2
    await setTestStat(pick.playerId, PLAYOFF_WEEKS.WILD_CARD, { rushYards: 100 });
    await setTestStat(pick.playerId, PLAYOFF_WEEKS.DIVISIONAL, { rushYards: 500 });
    await setTestStat(sub.id, PLAYOFF_WEEKS.DIVISIONAL, { rushYards: 200 });

    const scores = await getLeagueScores(testDb, league.id);
    const mine = scores.entries.find((e) => e.entryId === entries[0].id)!;
    const w1 = mine.weeks.find((w) => w.week === PLAYOFF_WEEKS.WILD_CARD)!;
    const w2 = mine.weeks.find((w) => w.week === PLAYOFF_WEEKS.DIVISIONAL)!;
    const w1Slot = w1.lineup.find((s) => s.playerId === pick.playerId);
    expect(w1Slot).toBeDefined(); // original's 10 pts count in week 1
    const w2Slot = w2.lineup.find((s) => s.playerId === sub.id);
    expect(w2Slot).toBeDefined(); // substitute's 20 pts count in week 2
    expect(w2Slot!.playerName).toBe("The Sub");
    expect(w2.lineup.some((s) => s.playerId === pick.playerId)).toBe(false); // original's 50 does NOT
  });
});
