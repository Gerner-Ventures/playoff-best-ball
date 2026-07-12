import type { GameOdds, OddsProvider } from "./provider";

/** Deterministic in-memory provider for tests, mirroring FakeStatsProvider. */
export class FakeOddsProvider implements OddsProvider {
  constructor(private readonly games: GameOdds[]) {}

  async fetchUpcomingOdds(): Promise<GameOdds[]> {
    return this.games;
  }
}
