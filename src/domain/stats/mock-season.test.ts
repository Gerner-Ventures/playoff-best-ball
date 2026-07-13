import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createStandardPool } from "../../../tests/helpers/db";
import { advanceMockWeek } from "./mock-season";
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
});
