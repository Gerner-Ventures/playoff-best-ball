// The fabricated season: one made-up game per playoff week, with deterministic
// seeded stat lines for every player in the pool.
//
// This wraps the ORIGINAL generator (buildMockWeek / mockLine in ../mock-season.ts)
// rather than replacing it — that code and its tests are untouched. What this adds
// is the two things a demo needs and the raw generator never provided: the full
// four-week bracket including weeks that have not happened yet, and kickoff times
// anchored to now instead of a hardcoded 2027.
//
// Kept as a first-class option alongside the captured real seasons. It is fully
// controllable and needs no network, which makes it the right default for tests and
// for anyone who wants a season with no real-world outcome attached.

import { buildMockWeek, type MockPlayer } from "../mock-season";
import { demoRoundStart } from "../demo-clock";
import {
  eventIdPrefixFor,
  groupRostersByTeam,
  type SeasonDataInput,
  type SeasonDataSource,
} from "../season-source";
import type { ProviderGame, ProviderPlayerStats, ProviderPoolPlayer } from "../provider";
import { PLAYOFF_WEEKS } from "../../season";

const ALL_WEEKS = Object.values(PLAYOFF_WEEKS);

export function createSyntheticSource(players: MockPlayer[]): SeasonDataSource {
  const pool: ProviderPoolPlayer[] = players.map((p) => ({
    externalId: p.externalId,
    name: p.name,
    position: p.position,
    nflTeam: p.nflTeam,
  }));

  return {
    id: "synthetic",
    eventIdPrefix: eventIdPrefixFor("synthetic"),
    teams: [...new Set(players.map((p) => p.nflTeam))].sort(),

    seasonData({ playedThroughWeek, now, season }: SeasonDataInput) {
      const games: ProviderGame[] = [];
      const stats: Record<string, ProviderPlayerStats[]> = {};

      for (const week of ALL_WEEKS) {
        const built = buildMockWeek(players, season, week);
        const played = week <= playedThroughWeek;
        // One kickoff per round: the generator emits a single game per week, so
        // there are no intra-round offsets to preserve here.
        const startsAt = demoRoundStart(week, playedThroughWeek, now);

        for (const game of built.games) {
          games.push({
            ...game,
            state: played ? "FINAL" : "SCHEDULED",
            startsAt,
            // A game that has not kicked off has no score to show.
            homeScore: played ? game.homeScore : 0,
            awayScore: played ? game.awayScore : 0,
          });
          stats[game.eventId] = played ? (built.stats[game.eventId] ?? []) : [];
        }
      }

      return { games, stats, rosters: groupRostersByTeam(pool) };
    },

    // No production history to rank by, so the pool's own order stands. Callers
    // that want a realistic board seed the pool in the order they want.
    defaultRanks() {
      return players.map((p, i) => ({ externalId: p.externalId, defaultRank: i + 1 }));
    },
  };
}
