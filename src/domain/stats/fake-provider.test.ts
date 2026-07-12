import { describe, it, expect } from "vitest";
import { FakeStatsProvider } from "./fake-provider";
import { emptyStatLine } from "./stat-line";

describe("FakeStatsProvider", () => {
  const fake = new FakeStatsProvider({
    games: [
      {
        eventId: "g1", week: 1, homeTeam: "KC", awayTeam: "BUF",
        startsAt: new Date("2027-01-09T18:00:00Z"), state: "FINAL", homeScore: 27, awayScore: 20,
      },
    ],
    stats: {
      g1: [
        {
          externalId: "e-mahomes", name: "Patrick Mahomes", position: "QB", nflTeam: "KC",
          stats: { ...emptyStatLine(), passYards: 300, passTd: 3 },
        },
      ],
    },
    rosters: {
      KC: [{ externalId: "e-mahomes", name: "Patrick Mahomes", position: "QB", nflTeam: "KC" }],
    },
  });

  it("serves configured games, stats, and rosters", async () => {
    expect(await fake.fetchWeekGames(2026, 1)).toHaveLength(1);
    expect(await fake.fetchWeekGames(2026, 2)).toHaveLength(0);
    expect((await fake.fetchGameStats("g1"))[0].stats.passYards).toBe(300);
    expect(await fake.fetchGameStats("unknown")).toEqual([]);
    expect(await fake.fetchTeamRoster(2026, "KC")).toHaveLength(1);
    expect(await fake.fetchTeamRoster(2026, "NE")).toEqual([]);
  });
});
