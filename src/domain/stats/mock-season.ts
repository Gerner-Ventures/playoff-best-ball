import type { PlayerPosition } from "@prisma/client";
import type { FakeStatsData } from "./fake-provider";
import type { ProviderPlayerStats } from "./provider";
import { emptyStatLine, type StatLine } from "./stat-line";

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
