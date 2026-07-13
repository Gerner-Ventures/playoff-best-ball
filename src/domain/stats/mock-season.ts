import type { PlayerPosition, PrismaClient } from "@prisma/client";
import { FakeStatsProvider, type FakeStatsData } from "./fake-provider";
import type { ProviderPlayerStats } from "./provider";
import { emptyStatLine, type StatLine } from "./stat-line";
import { syncWeekStats } from "./sync-week";

interface MockPlayer {
  externalId: string;
  name: string;
  position: PlayerPosition;
  nflTeam: string;
}

/** Deterministic pseudo-random from a string seed (no Math.random — reproducible). */
function seededNumber(seed: string, max: number): number {
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
 * Advances the simulated playoff season by one week (the December beta's lever,
 * pulled from the admin panel; also the `npm run mock:week` dev script's engine).
 *
 * Preserves the original script's behavior exactly: backfill `mock-${id}`
 * externalIds onto pool players that lack one (so syncWeekStats can match them),
 * fabricate one FINAL game + a deterministic seeded stat line per pool player
 * via buildMockWeek, and write it all through the real syncWeekStats pipeline.
 * The next week is whatever mock week hasn't been simulated yet (1 → 4);
 * advancing past the Super Bowl throws.
 */
export async function advanceMockWeek(
  db: PrismaClient,
  { season }: { season: number },
): Promise<AdvanceMockWeekResult> {
  const latest = await db.nflGame.findFirst({
    where: { season, eventId: { startsWith: `mock-${season}-` } },
    orderBy: { week: "desc" },
    select: { week: true },
  });
  const week = (latest?.week ?? 0) + 1;
  if (week > 4) throw new Error(`Mock season ${season} is complete (all 4 playoff weeks are FINAL).`);

  const players = await db.player.findMany({ where: { season } });
  // ensure every player has an externalId so sync can match
  for (const p of players.filter((p) => !p.externalId)) {
    await db.player.update({ where: { id: p.id }, data: { externalId: `mock-${p.id}` } });
  }
  const withIds = players.map((p) => ({
    externalId: p.externalId ?? `mock-${p.id}`,
    name: p.name, position: p.position, nflTeam: p.nflTeam,
  }));
  const provider = new FakeStatsProvider(buildMockWeek(withIds, season, week));
  const result = await syncWeekStats(db, provider, { season, week });
  return { week, gamesCreated: result.games, statLines: result.statLines };
}
