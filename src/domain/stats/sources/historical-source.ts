// A real NFL postseason, replayed as a demo season.
//
// The snapshot holds what actually happened: real players, real box scores, real
// results. Two transformations turn that into a demo:
//
//   1. Event ids get an `h<year>-` prefix, so the database can tell which source
//      owns a season without a schema column (see season-source.ts).
//   2. Kickoff times are moved onto the demo's timeline. Each round is placed by
//      demoRoundStart, and every game keeps its real offset within its round, so
//      the Saturday early game and the Sunday night game stay distinguishable.
//
// The season number is NOT rewritten here. syncWeekStats writes whatever season it
// is given, and FakeStatsProvider ignores the season argument entirely, so a 2024
// snapshot lands under CURRENT_SEASON for free.

import { demoRoundStart } from "../demo-clock";
import {
  eventIdPrefixFor,
  groupRostersByTeam,
  type SeasonDataInput,
  type SeasonDataSource,
  type SourceId,
} from "../season-source";
import { seededNumber } from "../mock-season";
import { computePoints } from "../../scoring/compute-points";
import { SCORING_PRESETS } from "../../league-settings";
import type { ProviderGame, ProviderPlayerStats, ProviderPoolPlayer } from "../provider";
import type { DemoSeasonSnapshot } from "@/lib/demo/season-snapshot";

/**
 * How far a player's draft rank may drift from their actual postseason finish.
 *
 * Ranking purely by what a player went on to score gives autodraft perfect
 * hindsight: every bot team looks like a season-winning roster and the board reads
 * as fake. A deterministic wobble keeps the ordering plausible — good players still
 * go early — without it being a ranked list of the answers.
 */
const RANK_JITTER = 0.3;

export function createHistoricalSource(snapshot: DemoSeasonSnapshot): SeasonDataSource {
  const id = `historical:${snapshot.capturedSeason}` as SourceId;
  const prefix = eventIdPrefixFor(id);
  const demoEventId = (eventId: string) => `${prefix}${eventId}`;

  const pool: ProviderPoolPlayer[] = snapshot.pool.map((p) => ({
    externalId: p.externalId,
    name: p.name,
    position: p.position,
    nflTeam: p.nflTeam,
  }));

  return {
    id,
    eventIdPrefix: prefix,
    teams: [...snapshot.teams].sort(),

    seasonData({ playedThroughWeek, now }: SeasonDataInput) {
      const games: ProviderGame[] = [];
      const stats: Record<string, ProviderPlayerStats[]> = {};

      for (const { week, games: weekGames } of snapshot.weeks) {
        const played = week <= playedThroughWeek;
        const roundStart = demoRoundStart(week, playedThroughWeek, now);
        // Preserve each game's real offset from the first kickoff of its round.
        const realStarts = weekGames.map((g) => new Date(g.startsAt).getTime());
        const earliest = Math.min(...realStarts);

        for (const [i, g] of weekGames.entries()) {
          const eventId = demoEventId(g.eventId);
          games.push({
            eventId,
            week,
            homeTeam: g.homeTeam,
            awayTeam: g.awayTeam,
            startsAt: new Date(roundStart.getTime() + (realStarts[i] - earliest)),
            state: played ? "FINAL" : "SCHEDULED",
            homeScore: played ? g.homeScore : 0,
            awayScore: played ? g.awayScore : 0,
          });
          stats[eventId] = played
            ? (snapshot.stats[g.eventId] ?? []).map((l) => ({ ...l }))
            : [];
        }
      }

      return { games, stats, rosters: groupRostersByTeam(pool) };
    },

    defaultRanks() {
      const totals = new Map<string, number>();
      for (const lines of Object.values(snapshot.stats)) {
        for (const l of lines) {
          const points = computePoints(l.stats, SCORING_PRESETS.half_ppr).total;
          totals.set(l.externalId, (totals.get(l.externalId) ?? 0) + points);
        }
      }

      // Deterministic wobble: a fixed multiplier per player, derived from their id.
      const scored = pool.map((p) => {
        const actual = totals.get(p.externalId) ?? 0;
        const wobble = 1 - RANK_JITTER / 2 + (seededNumber(`rank:${p.externalId}`, 1000) / 1000) * RANK_JITTER;
        return { externalId: p.externalId, name: p.name, score: actual * wobble };
      });

      scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
      return scored.map((p, i) => ({ externalId: p.externalId, defaultRank: i + 1 }));
    },
  };
}
