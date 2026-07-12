import type {
  ProviderGame,
  ProviderPlayerStats,
  ProviderPoolPlayer,
  StatsProvider,
} from "./provider";

export interface FakeStatsData {
  games: ProviderGame[];
  /** eventId → stat lines */
  stats: Record<string, ProviderPlayerStats[]>;
  /** team abbreviation → roster */
  rosters: Record<string, ProviderPoolPlayer[]>;
}

/**
 * Deterministic in-memory provider: drives unit/integration tests, the
 * `mock:week` dev script, and the December beta's simulated playoffs.
 */
export class FakeStatsProvider implements StatsProvider {
  constructor(private readonly data: FakeStatsData) {}

  async fetchWeekGames(_season: number, week: number): Promise<ProviderGame[]> {
    return this.data.games.filter((g) => g.week === week);
  }

  async fetchGameStats(eventId: string): Promise<ProviderPlayerStats[]> {
    return this.data.stats[eventId] ?? [];
  }

  async fetchTeamRoster(_season: number, team: string): Promise<ProviderPoolPlayer[]> {
    return this.data.rosters[team] ?? [];
  }
}
