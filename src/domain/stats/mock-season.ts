import type { GameState, PlayerPosition, PrismaClient } from "@prisma/client";
import { FakeStatsProvider, type FakeStatsData } from "./fake-provider";
import type { ProviderPlayerStats } from "./provider";
import { emptyStatLine, type StatLine } from "./stat-line";
import { syncWeekStats } from "./sync-week";
import { sourceIdForEventId, type SeasonDataSource } from "./season-source";
import { createSyntheticSource } from "./sources/synthetic-source";

export interface MockPlayer {
  externalId: string;
  name: string;
  position: PlayerPosition;
  nflTeam: string;
}

/** Deterministic pseudo-random from a string seed (no Math.random — reproducible). */
export function seededNumber(seed: string, max: number): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % max;
}

function mockLine(p: MockPlayer, week: number): StatLine {
  const roll = (label: string, max: number) => seededNumber(`${p.externalId}:${week}:${label}`, max);
  const line = emptyStatLine();
  switch (p.position) {
    case "QB":
      return { ...line, passYards: 150 + roll("py", 250), passTd: roll("ptd", 4), passInt: roll("int", 3), rushYards: roll("ry", 40) };
    case "RB":
      return { ...line, rushYards: 30 + roll("ry", 120), rushTd: roll("rtd", 3), receptions: roll("rec", 6), recYards: roll("recy", 60) };
    case "WR":
      return { ...line, receptions: 2 + roll("rec", 9), recYards: 20 + roll("recy", 130), recTd: roll("rtd", 2) };
    case "TE":
      return { ...line, receptions: 1 + roll("rec", 7), recYards: 10 + roll("recy", 80), recTd: roll("rtd", 2) };
    case "K":
      return { ...line, fgMade: Array.from({ length: 1 + roll("fg", 3) }, (_, i) => 25 + roll(`d${i}`, 30)), xpMade: roll("xp", 5) };
    case "DST":
      return { ...line, sacks: roll("sk", 5), defInterceptions: roll("di", 3), pointsAllowed: roll("pa", 35) };
  }
}

/** One mock playoff week for a set of players (one shared fake game). */
export function buildMockWeek(players: MockPlayer[], season: number, week: number): FakeStatsData {
  const eventId = `mock-${season}-w${week}`;
  const stats: ProviderPlayerStats[] = players.map((p) => ({
    externalId: p.externalId, name: p.name, position: p.position, nflTeam: p.nflTeam,
    stats: mockLine(p, week),
  }));
  return {
    games: [
      {
        eventId, week, homeTeam: "KC", awayTeam: "BUF",
        startsAt: new Date(Date.UTC(2027, 0, 9 + week * 7)), state: "FINAL",
        homeScore: 20 + seededNumber(`${eventId}:h`, 20), awayScore: 20 + seededNumber(`${eventId}:a`, 20),
      },
    ],
    stats: { [eventId]: stats },
    rosters: {},
  };
}

export interface AdvanceMockWeekResult {
  week: number;
  gamesCreated: number;
  statLines: number;
}

/**
 * The next week to play: the lowest week that is not yet FINAL, falling back to
 * one past the highest FINAL week when nothing is pending.
 *
 * The fallback is what the original implementation did (highest existing week + 1),
 * and it still covers the case where only played weeks exist. The pending branch is
 * new and necessary: once a demo seeder writes the full four-week bracket up front,
 * "highest week that exists" is always 4 and the season looks complete before a
 * single game has been advanced. Mirrors how league-projections derives nextWeek.
 */
export function nextWeekToAdvance(games: { week: number; state: GameState }[]): number {
  const pending = games.filter((g) => g.state !== "FINAL").map((g) => g.week);
  if (pending.length > 0) return Math.min(...pending);
  const finished = games.filter((g) => g.state === "FINAL").map((g) => g.week);
  return (finished.length > 0 ? Math.max(...finished) : 0) + 1;
}

export interface AdvanceMockWeekInput {
  season: number;
  /** Defaults to the synthetic source built from the season's player pool. */
  source?: SeasonDataSource;
  /** Anchor for the fictional schedule; defaults to the real clock. */
  now?: Date;
}

/**
 * Advances the simulated playoff season by one week (the December beta's lever,
 * pulled from the admin panel; also the `npm run mock:week` dev script's engine).
 *
 * Behavior with no `source` is unchanged: backfill `mock-${id}` externalIds onto
 * pool players that lack one (so syncWeekStats can match them), then write one
 * fabricated FINAL game plus a deterministic seeded stat line per pool player
 * through the real syncWeekStats pipeline. Advancing past the Super Bowl throws.
 *
 * With a `source`, the same lever plays the next week of whatever season that
 * source describes — a captured real postseason, for instance.
 */
export async function advanceMockWeek(
  db: PrismaClient,
  { season, source, now = new Date() }: AdvanceMockWeekInput,
): Promise<AdvanceMockWeekResult> {
  const existing = await db.nflGame.findMany({
    where: { season },
    select: { week: true, state: true, eventId: true },
  });

  const week = nextWeekToAdvance(existing);
  if (week > 4) {
    throw new Error(`Mock season ${season} is complete (all 4 playoff weeks are FINAL).`);
  }

  const resolved = source ?? (await syntheticSourceFromPool(db, season));

  // A season may only ever hold one source: eliminations are derived by unioning
  // the losers of every FINAL game, so half a real bracket plus half a fabricated
  // one produces a nonsense set of eliminated teams. Refuse rather than corrupt.
  const incumbent = existing.map((g) => sourceIdForEventId(g.eventId)).find((id) => id !== null);
  if (incumbent && incumbent !== resolved.id) {
    throw new Error(
      `Season ${season} already holds ${incumbent} data; refusing to write ${resolved.id} on top. ` +
        "Re-seed with --reset to switch sources.",
    );
  }

  // The source hands back all four weeks; FakeStatsProvider filters to the one
  // being advanced, so this writes exactly that week.
  const data = resolved.seasonData({ playedThroughWeek: week, now, season });
  const result = await syncWeekStats(db, new FakeStatsProvider(data), { season, week });
  return { week, gamesCreated: result.games, statLines: result.statLines };
}

/** The pre-existing default: fabricate a season from whatever players are in the pool. */
export async function syntheticSourceFromPool(
  db: PrismaClient,
  season: number,
): Promise<SeasonDataSource> {
  const players = await db.player.findMany({ where: { season } });
  // Every player needs an externalId or syncWeekStats cannot match its stat line.
  for (const p of players.filter((p) => !p.externalId)) {
    await db.player.update({ where: { id: p.id }, data: { externalId: `mock-${p.id}` } });
  }
  return createSyntheticSource(
    players.map((p) => ({
      externalId: p.externalId ?? `mock-${p.id}`,
      name: p.name,
      position: p.position,
      nflTeam: p.nflTeam,
    })),
  );
}
