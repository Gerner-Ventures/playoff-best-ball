// The seam that lets a demo season come from either a fabricated generator or a
// captured real postseason, without anything downstream knowing which.
//
// Both implementations produce the same `FakeStatsData` the codebase already uses,
// so the seeder, the week-advance lever and the re-anchor path all run through the
// real `syncWeekStats` pipeline rather than writing rows by hand.
//
// Note what is deliberately NOT here: the global `statsProvider` seam in
// src/lib/stats-provider.ts stays EMPTY. Pointing it at a source would let
// stats-sync-daily (which syncs all four weeks unconditionally) finalize an entire
// demo season on its first tick. Demo data is only ever written by explicit levers.

import type { FakeStatsData } from "./fake-provider";
import type { ProviderPoolPlayer } from "./provider";

/** Which season data a demo is running on. */
export type SourceId = "synthetic" | `historical:${number}`;

export type ParsedSourceId =
  | { kind: "synthetic" }
  | { kind: "historical"; season: number };

/** Parses a source id from a CLI flag, env var, or request body. Throws on garbage. */
export function parseSourceId(raw: string): ParsedSourceId {
  if (raw === "synthetic") return { kind: "synthetic" };
  const match = /^historical:(\d{4})$/.exec(raw);
  if (match) return { kind: "historical", season: Number(match[1]) };
  throw new Error(
    `Unknown season source ${JSON.stringify(raw)}. Expected "synthetic" or "historical:<year>".`,
  );
}

/**
 * Event-id prefix for a source. This is the database's witness of which source owns
 * a season — no schema column needed. A season holding two sources at once would be
 * incoherent (eliminations would union two different brackets), so callers use this
 * to detect and refuse a mismatch.
 *
 * `synthetic` keeps the historical `mock-` prefix so existing rows and
 * advanceMockWeek's own history keep working.
 */
export function eventIdPrefixFor(id: SourceId): string {
  const parsed = parseSourceId(id);
  return parsed.kind === "synthetic" ? "mock-" : `h${parsed.season}-`;
}

/** Inverse of `eventIdPrefixFor`: which source wrote this event id, if any. */
export function sourceIdForEventId(eventId: string): SourceId | null {
  if (eventId.startsWith("mock-")) return "synthetic";
  const match = /^h(\d{4})-/.exec(eventId);
  return match ? (`historical:${Number(match[1])}` as SourceId) : null;
}

export interface SeasonDataInput {
  /** Weeks 1..N are complete; N+1..4 are upcoming. 0 = nothing played yet. */
  playedThroughWeek: number;
  /** Anchor for the fictional schedule — see demo-clock.ts. */
  now: Date;
  season: number;
}

export interface SeasonDataSource {
  readonly id: SourceId;
  readonly eventIdPrefix: string;
  /** Teams appearing in this season, for the pool sync. */
  readonly teams: string[];
  /**
   * The whole season in one payload: all four weeks of games (FINAL through
   * `playedThroughWeek`, SCHEDULED after), stat lines for the played weeks only,
   * and rosters for the pool.
   *
   * Returning all four weeks at once is the point. `FakeStatsProvider` filters
   * games by week, so one provider built from this drives every call to
   * `syncWeekStats` — and because that function upserts a row for every game it is
   * handed regardless of state, future weeks land in the database as SCHEDULED.
   * Without those rows `getLeagueProjections` finds no non-FINAL game, computes
   * `nextWeek = null`, and blanks the premium projections mid-season.
   */
  seasonData(input: SeasonDataInput): FakeStatsData;
  /** Draft-board order, by externalId. Applied after the pool sync. */
  defaultRanks(): { externalId: string; defaultRank: number }[];
}

/** Groups a flat pool into the `team -> players` shape `syncPlayerPool` reads. */
export function groupRostersByTeam(
  players: ProviderPoolPlayer[],
): Record<string, ProviderPoolPlayer[]> {
  const byTeam: Record<string, ProviderPoolPlayer[]> = {};
  for (const p of players) (byTeam[p.nflTeam] ??= []).push(p);
  return byTeam;
}
