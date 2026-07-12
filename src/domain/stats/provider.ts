import type { PlayerPosition } from "@prisma/client";
import type { StatLine } from "./stat-line";

export type ProviderGameState = "SCHEDULED" | "IN_PROGRESS" | "FINAL";

export interface ProviderGame {
  eventId: string;
  week: number; // OUR playoff week (1..4)
  homeTeam: string;
  awayTeam: string;
  startsAt: Date;
  state: ProviderGameState;
  homeScore: number;
  awayScore: number;
}

export interface ProviderPlayerStats {
  externalId: string;
  name: string;
  position: PlayerPosition | null; // null when the source doesn't say (matched by externalId instead)
  nflTeam: string;
  stats: StatLine;
}

export interface ProviderPoolPlayer {
  externalId: string;
  name: string;
  position: PlayerPosition;
  nflTeam: string;
}

/**
 * The spec's escape hatch: all stat ingestion goes through this seam.
 * ESPN is the v1 adapter; a licensed feed is a new implementation, not a rewrite.
 */
export interface StatsProvider {
  fetchWeekGames(season: number, week: number): Promise<ProviderGame[]>;
  fetchGameStats(eventId: string): Promise<ProviderPlayerStats[]>;
  fetchTeamRoster(season: number, team: string): Promise<ProviderPoolPlayer[]>;
}
