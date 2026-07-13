export interface GameOdds {
  homeTeam: string; // OUR abbreviations
  awayTeam: string;
  homeWinProb: number; // vig-removed, 0..1
  awayWinProb: number;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  commenceTime: Date;
}

/** Same seam philosophy as StatsProvider: The Odds API is v1; anything else is an adapter. */
export interface OddsProvider {
  /** Upcoming NFL games with moneyline-derived win probabilities. */
  fetchUpcomingOdds(): Promise<GameOdds[]>;
}
