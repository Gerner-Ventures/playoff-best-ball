import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestPlayer } from "../../../tests/helpers/db";
import { syncWeekStats } from "./sync-week";
import { FakeStatsProvider } from "./fake-provider";
import { emptyStatLine, parseStatLine } from "./stat-line";
import { CURRENT_SEASON } from "../season";

function makeProvider(passYards: number, state: "FINAL" | "IN_PROGRESS" | "SCHEDULED" = "FINAL") {
  return new FakeStatsProvider({
    games: [
      {
        eventId: "g1", week: 1, homeTeam: "KC", awayTeam: "BUF",
        startsAt: new Date("2027-01-09T18:00:00Z"), state, homeScore: 27, awayScore: 20,
      },
    ],
    stats: {
      g1: [
        {
          externalId: "e1", name: "Patrick Mahomes", position: "QB", nflTeam: "KC",
          stats: { ...emptyStatLine(), passYards },
        },
        {
          externalId: "e-unknown", name: "Practice Squad Guy", position: "RB", nflTeam: "KC",
          stats: { ...emptyStatLine(), rushYards: 5 },
        },
      ],
    },
    rosters: {},
  });
}

describe("syncWeekStats", () => {
  beforeEach(resetDb);

  it("upserts games and stat lines matched by externalId, reporting unmatched", async () => {
    const mahomes = await createTestPlayer("QB", { name: "Patrick Mahomes" });
    await testDb.player.update({ where: { id: mahomes.id }, data: { externalId: "e1" } });

    const result = await syncWeekStats(testDb, makeProvider(300), { season: CURRENT_SEASON, week: 1 });
    expect(result.games).toBe(1);
    expect(result.statLines).toBe(1);
    expect(result.unmatched).toEqual(["Practice Squad Guy (e-unknown)"]);

    const game = await testDb.nflGame.findUniqueOrThrow({ where: { eventId: "g1" } });
    expect(game.state).toBe("FINAL");
    const stat = await testDb.playerStat.findUniqueOrThrow({
      where: { playerId_season_week: { playerId: mahomes.id, season: CURRENT_SEASON, week: 1 } },
    });
    expect(parseStatLine(stat.stats).passYards).toBe(300);
  });

  it("re-sync updates in place (idempotent, live-game progression)", async () => {
    const mahomes = await createTestPlayer("QB", { name: "Patrick Mahomes" });
    await testDb.player.update({ where: { id: mahomes.id }, data: { externalId: "e1" } });

    await syncWeekStats(testDb, makeProvider(150, "IN_PROGRESS"), { season: CURRENT_SEASON, week: 1 });
    await syncWeekStats(testDb, makeProvider(300, "FINAL"), { season: CURRENT_SEASON, week: 1 });

    expect(await testDb.playerStat.count()).toBe(1);
    const stat = await testDb.playerStat.findFirstOrThrow();
    expect(parseStatLine(stat.stats).passYards).toBe(300);
    expect((await testDb.nflGame.findUniqueOrThrow({ where: { eventId: "g1" } })).state).toBe("FINAL");
  });

  it("does not fetch stats for games that haven't started", async () => {
    const result = await syncWeekStats(testDb, makeProvider(0, "SCHEDULED"), {
      season: CURRENT_SEASON, week: 1,
    });
    expect(result.games).toBe(1);
    expect(result.statLines).toBe(0);
    expect(await testDb.playerStat.count()).toBe(0);
  });

  it("never clobbers a manual override", async () => {
    const mahomes = await createTestPlayer("QB", { name: "Patrick Mahomes" });
    await testDb.player.update({ where: { id: mahomes.id }, data: { externalId: "e1" } });
    await syncWeekStats(testDb, makeProvider(150), { season: CURRENT_SEASON, week: 1 });
    await testDb.playerStat.updateMany({
      where: { playerId: mahomes.id },
      data: { manualOverride: true, stats: { ...emptyStatLine(), passYards: 999 } },
    });
    await syncWeekStats(testDb, makeProvider(300), { season: CURRENT_SEASON, week: 1 });
    const stat = await testDb.playerStat.findFirstOrThrow();
    expect(parseStatLine(stat.stats).passYards).toBe(999); // survived the sync
  });
});
