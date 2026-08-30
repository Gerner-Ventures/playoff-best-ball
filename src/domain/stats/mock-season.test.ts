import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createStandardPool } from "../../../tests/helpers/db";
import { advanceMockWeek, nextWeekToAdvance } from "./mock-season";
import { createSyntheticSource } from "./sources/synthetic-source";
import { FakeStatsProvider } from "./fake-provider";
import { syncWeekStats } from "./sync-week";
import { CURRENT_SEASON } from "../season";

describe("advanceMockWeek", () => {
  beforeEach(resetDb);

  it("first call simulates week 1: one FINAL game + a stat line per pool player", async () => {
    const players = await createStandardPool(2);
    const result = await advanceMockWeek(testDb, { season: CURRENT_SEASON });
    expect(result).toEqual({ week: 1, gamesCreated: 1, statLines: players.length });

    const games = await testDb.nflGame.findMany({ where: { season: CURRENT_SEASON, week: 1 } });
    expect(games).toHaveLength(1);
    expect(games[0].state).toBe("FINAL");
    expect(games[0].eventId).toBe(`mock-${CURRENT_SEASON}-w1`);
    expect(
      await testDb.playerStat.count({ where: { season: CURRENT_SEASON, week: 1 } }),
    ).toBe(players.length);
  });

  it("backfills missing externalIds so every pool player gets matched", async () => {
    // createTestPlayer seeds players WITHOUT externalId — the script backfilled
    // `mock-${id}` before syncing; the extraction must preserve that.
    await createStandardPool(1);
    const result = await advanceMockWeek(testDb, { season: CURRENT_SEASON });
    expect(result.statLines).toBeGreaterThan(0);
    const withoutIds = await testDb.player.count({
      where: { season: CURRENT_SEASON, externalId: null },
    });
    expect(withoutIds).toBe(0);
  });

  it("calling again advances to the next week — no duplicates for week 1", async () => {
    const players = await createStandardPool(1);
    await advanceMockWeek(testDb, { season: CURRENT_SEASON });
    const second = await advanceMockWeek(testDb, { season: CURRENT_SEASON });
    expect(second.week).toBe(2);

    expect(await testDb.nflGame.count({ where: { season: CURRENT_SEASON, week: 1 } })).toBe(1);
    expect(await testDb.nflGame.count({ where: { season: CURRENT_SEASON, week: 2 } })).toBe(1);
    expect(
      await testDb.playerStat.count({ where: { season: CURRENT_SEASON, week: 1 } }),
    ).toBe(players.length);
    expect(
      await testDb.playerStat.count({ where: { season: CURRENT_SEASON, week: 2 } }),
    ).toBe(players.length);
  });

  it("refuses to advance past week 4 (Super Bowl is the end of the season)", async () => {
    await createStandardPool(1);
    for (let i = 0; i < 4; i++) await advanceMockWeek(testDb, { season: CURRENT_SEASON });
    await expect(advanceMockWeek(testDb, { season: CURRENT_SEASON })).rejects.toThrow(
      /complete/i,
    );
    expect(await testDb.nflGame.count({ where: { season: CURRENT_SEASON } })).toBe(4);
  });

  it("advances into a season that already has all four weeks scheduled", async () => {
    // The demo seeder writes the full bracket up front — weeks 1..N FINAL and the
    // rest SCHEDULED — so that projections have a nextWeek to find. The original
    // "highest existing week + 1" rule read that as a finished season and refused
    // to advance at all. The rule is now "lowest week that is not FINAL".
    const players = await createStandardPool(2);
    const source = createSyntheticSource(
      players.map((p) => ({
        externalId: p.externalId ?? `mock-${p.id}`,
        name: p.name,
        position: p.position,
        nflTeam: p.nflTeam,
      })),
    );
    // Backfill externalIds the way the seeder would, so stat lines can match.
    for (const p of players.filter((p) => !p.externalId)) {
      await testDb.player.update({ where: { id: p.id }, data: { externalId: `mock-${p.id}` } });
    }

    const now = new Date();
    const data = source.seasonData({ playedThroughWeek: 2, now, season: CURRENT_SEASON });
    await syncWeekStats(testDb, new FakeStatsProvider(data), { season: CURRENT_SEASON, week: 1 });
    await syncWeekStats(testDb, new FakeStatsProvider(data), { season: CURRENT_SEASON, week: 2 });
    await syncWeekStats(testDb, new FakeStatsProvider(data), { season: CURRENT_SEASON, week: 3 });
    await syncWeekStats(testDb, new FakeStatsProvider(data), { season: CURRENT_SEASON, week: 4 });
    expect(await testDb.nflGame.count({ where: { season: CURRENT_SEASON } })).toBe(4);

    const result = await advanceMockWeek(testDb, { season: CURRENT_SEASON, source, now });
    expect(result.week).toBe(3);
    const week3 = await testDb.nflGame.findFirst({ where: { season: CURRENT_SEASON, week: 3 } });
    expect(week3!.state).toBe("FINAL");
    // Week 4 must stay SCHEDULED, or nextWeek goes null and projections blank out.
    const week4 = await testDb.nflGame.findFirst({ where: { season: CURRENT_SEASON, week: 4 } });
    expect(week4!.state).toBe("SCHEDULED");
  });

  it("refuses to write one source's data on top of another's", async () => {
    // Eliminations are the losers of every FINAL game, so a season holding half a
    // real bracket and half a fabricated one yields a nonsense eliminated set.
    await createStandardPool(1);
    await advanceMockWeek(testDb, { season: CURRENT_SEASON }); // writes `mock-` events

    const impostor = {
      ...createSyntheticSource([]),
      id: "historical:2024" as const,
      eventIdPrefix: "h2024-",
    };
    await expect(
      advanceMockWeek(testDb, { season: CURRENT_SEASON, source: impostor }),
    ).rejects.toThrow(/already holds synthetic/i);
  });
});

describe("nextWeekToAdvance", () => {
  it("starts at week 1 for an empty season", () => {
    expect(nextWeekToAdvance([])).toBe(1);
  });

  it("takes the lowest non-FINAL week when a bracket is scheduled", () => {
    expect(
      nextWeekToAdvance([
        { week: 1, state: "FINAL" },
        { week: 2, state: "FINAL" },
        { week: 3, state: "SCHEDULED" },
        { week: 4, state: "SCHEDULED" },
      ]),
    ).toBe(3);
  });

  it("falls back to one past the highest FINAL week when nothing is pending", () => {
    // The original behavior, still the right answer when only played weeks exist.
    expect(
      nextWeekToAdvance([
        { week: 1, state: "FINAL" },
        { week: 2, state: "FINAL" },
      ]),
    ).toBe(3);
  });

  it("returns 5 for a fully FINAL season, so callers can refuse", () => {
    expect(
      nextWeekToAdvance([1, 2, 3, 4].map((week) => ({ week, state: "FINAL" as const }))),
    ).toBe(5);
  });

  it("treats an in-progress week as the one to advance", () => {
    expect(
      nextWeekToAdvance([
        { week: 1, state: "FINAL" },
        { week: 2, state: "IN_PROGRESS" },
      ]),
    ).toBe(2);
  });
});
