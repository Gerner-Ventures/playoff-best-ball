import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { getEliminatedTeams } from "./eliminated-teams";
import { CURRENT_SEASON } from "../season";

async function game(
  eventId: string,
  week: number,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  state: "FINAL" | "IN_PROGRESS" = "FINAL",
) {
  return testDb.nflGame.create({
    data: {
      season: CURRENT_SEASON, week, eventId, homeTeam: home, awayTeam: away,
      startsAt: new Date("2027-01-10T18:00:00Z"), state, homeScore, awayScore,
    },
  });
}

describe("getEliminatedTeams", () => {
  beforeEach(resetDb);

  it("losers of FINAL playoff games are eliminated; winners and unplayed teams are not", async () => {
    await game("g1", 1, "KC", "BUF", 27, 20); // BUF out
    await game("g2", 1, "PHI", "DET", 10, 31); // PHI out
    await game("g3", 1, "BAL", "LAR", 14, 14, "IN_PROGRESS"); // nobody yet
    const eliminated = await getEliminatedTeams(testDb, CURRENT_SEASON);
    expect(eliminated).toEqual(new Set(["BUF", "PHI"]));
  });

  it("empty when no games are final", async () => {
    expect(await getEliminatedTeams(testDb, CURRENT_SEASON)).toEqual(new Set());
  });
});
