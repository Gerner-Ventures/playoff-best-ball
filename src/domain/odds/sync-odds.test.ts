import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { syncTeamOdds } from "./sync-odds";
import { FakeOddsProvider } from "./fake-provider";
import { CURRENT_SEASON } from "../season";

describe("syncTeamOdds", () => {
  beforeEach(resetDb);

  it("matches provider games to the earliest unfinished week and upserts both teams", async () => {
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON,
        week: 2,
        eventId: "g1",
        homeTeam: "KC",
        awayTeam: "BUF",
        startsAt: new Date(Date.now() + 24 * 3600 * 1000),
        state: "SCHEDULED",
      },
    });
    const provider = new FakeOddsProvider([
      {
        homeTeam: "KC",
        awayTeam: "BUF",
        homeWinProb: 0.6,
        awayWinProb: 0.4,
        homeMoneyline: -150,
        awayMoneyline: 130,
        commenceTime: new Date(),
      },
      {
        // not one of our scheduled games — ignored
        homeTeam: "AAA",
        awayTeam: "BBB",
        homeWinProb: 0.5,
        awayWinProb: 0.5,
        homeMoneyline: null,
        awayMoneyline: null,
        commenceTime: new Date(),
      },
    ]);
    const result = await syncTeamOdds(testDb, provider, { season: CURRENT_SEASON });
    expect(result.upserted).toBe(2);
    const kc = await testDb.teamOdds.findUniqueOrThrow({
      where: { season_week_team: { season: CURRENT_SEASON, week: 2, team: "KC" } },
    });
    expect(kc.winProb).toBeCloseTo(0.6);
    expect(kc.opponent).toBe("BUF");

    // idempotent re-sync updates in place
    const again = await syncTeamOdds(testDb, provider, { season: CURRENT_SEASON });
    expect(again.upserted).toBe(2);
    expect(await testDb.teamOdds.count()).toBe(2);
  });

  it("removes stale rows for active weeks when a game's pairing disappears from the provider", async () => {
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON,
        week: 2,
        eventId: "g1",
        homeTeam: "KC",
        awayTeam: "BUF",
        startsAt: new Date(Date.now() + 24 * 3600 * 1000),
        state: "SCHEDULED",
      },
    });
    const firstProvider = new FakeOddsProvider([
      {
        homeTeam: "KC",
        awayTeam: "BUF",
        homeWinProb: 0.6,
        awayWinProb: 0.4,
        homeMoneyline: -150,
        awayMoneyline: 130,
        commenceTime: new Date(),
      },
    ]);
    await syncTeamOdds(testDb, firstProvider, { season: CURRENT_SEASON });
    expect(await testDb.teamOdds.count()).toBe(2);

    // Reschedule: KC/BUF is gone; a different week-2 pairing is now on the board.
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON,
        week: 2,
        eventId: "g2",
        homeTeam: "PHI",
        awayTeam: "DET",
        startsAt: new Date(Date.now() + 24 * 3600 * 1000),
        state: "SCHEDULED",
      },
    });
    const secondProvider = new FakeOddsProvider([
      {
        homeTeam: "PHI",
        awayTeam: "DET",
        homeWinProb: 0.55,
        awayWinProb: 0.45,
        homeMoneyline: -120,
        awayMoneyline: 100,
        commenceTime: new Date(),
      },
    ]);
    await syncTeamOdds(testDb, secondProvider, { season: CURRENT_SEASON });

    const rows = await testDb.teamOdds.findMany({
      where: { season: CURRENT_SEASON, week: 2 },
    });
    const teams = rows.map((r) => r.team).sort();
    expect(teams).toEqual(["DET", "PHI"]); // KC and BUF stale rows are gone
  });

  it("stores probabilities by the provider's home/away labels, not our game orientation", async () => {
    // OUR game has home=BUF away=KC; provider reports the flipped orientation.
    await testDb.nflGame.create({
      data: {
        season: CURRENT_SEASON,
        week: 2,
        eventId: "g1",
        homeTeam: "BUF",
        awayTeam: "KC",
        startsAt: new Date(Date.now() + 24 * 3600 * 1000),
        state: "SCHEDULED",
      },
    });
    const provider = new FakeOddsProvider([
      {
        homeTeam: "KC",
        awayTeam: "BUF",
        homeWinProb: 0.6,
        awayWinProb: 0.4,
        homeMoneyline: -150,
        awayMoneyline: 130,
        commenceTime: new Date(),
      },
    ]);
    const result = await syncTeamOdds(testDb, provider, { season: CURRENT_SEASON });
    expect(result.upserted).toBe(2);
    const kc = await testDb.teamOdds.findUniqueOrThrow({
      where: { season_week_team: { season: CURRENT_SEASON, week: 2, team: "KC" } },
    });
    expect(kc.winProb).toBeCloseTo(0.6);
    expect(kc.opponent).toBe("BUF");
    const buf = await testDb.teamOdds.findUniqueOrThrow({
      where: { season_week_team: { season: CURRENT_SEASON, week: 2, team: "BUF" } },
    });
    expect(buf.winProb).toBeCloseTo(0.4);
    expect(buf.opponent).toBe("KC");
  });

  it("no scheduled games → no-op", async () => {
    const provider = new FakeOddsProvider([]);
    const result = await syncTeamOdds(testDb, provider, { season: CURRENT_SEASON });
    expect(result.upserted).toBe(0);
  });
});
