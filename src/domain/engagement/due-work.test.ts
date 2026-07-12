import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb, createTestUser, createStandardPool } from "../../../tests/helpers/db";
import { createLeague } from "@/domain/leagues/create-league";
import { joinLeague } from "@/domain/leagues/join-league";
import { startDraft } from "@/domain/draft/start-draft";
import { autodraftCurrentPick } from "@/domain/draft/autodraft";
import { findDueRecaps, findDuePreviews } from "./due-work";
import { CURRENT_SEASON } from "@/domain/season";

async function completedLeague() {
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
  return league;
}

function gameData(eventId: string, week: number, state: "FINAL" | "SCHEDULED", startsAt: Date) {
  return {
    season: CURRENT_SEASON, week, eventId, homeTeam: "KC", awayTeam: "BUF",
    startsAt, state, homeScore: state === "FINAL" ? 21 : 0, awayScore: state === "FINAL" ? 14 : 0,
  };
}

describe("findDueRecaps", () => {
  beforeEach(resetDb);

  it("is due when a week's games are all FINAL and above the watermark", async () => {
    const league = await completedLeague();
    await testDb.nflGame.create({ data: gameData("g1", 1, "FINAL", new Date("2027-01-10T18:00:00Z")) });
    expect(await findDueRecaps(testDb)).toEqual([{ leagueId: league.id, week: 1 }]);

    await testDb.league.update({ where: { id: league.id }, data: { lastRecapWeek: 1 } });
    expect(await findDueRecaps(testDb)).toEqual([]);
  });

  it("emits only the lowest pending week per league, catching up one week per tick", async () => {
    const league = await completedLeague();
    await testDb.nflGame.create({ data: gameData("g1", 1, "FINAL", new Date("2027-01-10T18:00:00Z")) });
    await testDb.nflGame.create({ data: gameData("g2", 2, "FINAL", new Date("2027-01-17T18:00:00Z")) });

    // Two finished weeks pending, but only week 1 is emitted this tick.
    expect(await findDueRecaps(testDb)).toEqual([{ leagueId: league.id, week: 1 }]);

    // After week 1's recap advances the watermark, the next tick emits week 2.
    await testDb.league.update({ where: { id: league.id }, data: { lastRecapWeek: 1 } });
    expect(await findDueRecaps(testDb)).toEqual([{ leagueId: league.id, week: 2 }]);
  });

  it("not due while any game in the week is unfinished, for incomplete drafts, or with no games", async () => {
    await completedLeague();
    await testDb.nflGame.create({ data: gameData("g1", 1, "FINAL", new Date("2027-01-10T18:00:00Z")) });
    await testDb.nflGame.create({ data: gameData("g2", 1, "SCHEDULED", new Date("2027-01-11T18:00:00Z")) });
    expect(await findDueRecaps(testDb)).toEqual([]);
    await testDb.draft.deleteMany(); // no complete draft → no recap even when FINAL
    await testDb.nflGame.update({ where: { eventId: "g2" }, data: { state: "FINAL", homeScore: 7 } });
    expect(await findDueRecaps(testDb)).toEqual([]);
  });
});

describe("findDuePreviews", () => {
  beforeEach(resetDb);

  it("is due when a week's games start within 48h and above the watermark", async () => {
    const league = await completedLeague();
    const soon = new Date(Date.now() + 24 * 3600 * 1000);
    await testDb.nflGame.create({ data: gameData("g1", 2, "SCHEDULED", soon) });
    expect(await findDuePreviews(testDb)).toEqual([{ leagueId: league.id, week: 2 }]);

    await testDb.league.update({ where: { id: league.id }, data: { lastPreviewWeek: 2 } });
    expect(await findDuePreviews(testDb)).toEqual([]);
  });

  it("emits only the lowest pending week per league when two weeks fall in the horizon", async () => {
    const league = await completedLeague();
    const soon = new Date(Date.now() + 12 * 3600 * 1000);
    const later = new Date(Date.now() + 40 * 3600 * 1000);
    await testDb.nflGame.create({ data: gameData("g1", 1, "SCHEDULED", soon) });
    await testDb.nflGame.create({ data: gameData("g2", 2, "SCHEDULED", later) });

    expect(await findDuePreviews(testDb)).toEqual([{ leagueId: league.id, week: 1 }]);

    await testDb.league.update({ where: { id: league.id }, data: { lastPreviewWeek: 1 } });
    expect(await findDuePreviews(testDb)).toEqual([{ leagueId: league.id, week: 2 }]);
  });

  it("not due when games are too far out", async () => {
    await completedLeague();
    const far = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await testDb.nflGame.create({ data: gameData("g1", 2, "SCHEDULED", far) });
    expect(await findDuePreviews(testDb)).toEqual([]);
  });
});
