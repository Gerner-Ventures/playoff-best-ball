import { normalizeTeamName } from "./team-mapping";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

export interface OddsAPIResponse {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    title: string;
    markets: {
      key: string;
      outcomes: {
        name: string;
        price: number;
      }[];
    }[];
  }[];
}

export interface GameOdds {
  homeTeam: string;
  awayTeam: string;
  homeWinProb: number;
  awayWinProb: number;
  homeMoneyline: number;
  awayMoneyline: number;
  commenceTime: Date;
}

/**
 * Convert American odds to implied probability
 * Negative odds (favorite): probability = |odds| / (|odds| + 100)
 * Positive odds (underdog): probability = 100 / (odds + 100)
 */
export function convertMoneylineToProb(odds: number): number {
  if (odds < 0) {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  } else {
    return 100 / (odds + 100);
  }
}

/**
 * Normalize probabilities to remove the vig (juice)
 * Raw implied probabilities sum to > 100% due to bookmaker margin
 */
export function removeVig(homeProb: number, awayProb: number): { home: number; away: number } {
  const total = homeProb + awayProb;
  return {
    home: homeProb / total,
    away: awayProb / total,
  };
}

/**
 * Fetch NFL game odds from The Odds API
 * Requires THE_ODDS_API_KEY environment variable
 */
export async function fetchNFLOdds(): Promise<GameOdds[]> {
  const apiKey = process.env.THE_ODDS_API_KEY;

  if (!apiKey) {
    console.warn("THE_ODDS_API_KEY not set, returning empty odds");
    return [];
  }

  const url = `${ODDS_API_BASE}/sports/americanfootball_nfl/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american`;

  const response = await fetch(url, {
    next: { revalidate: 300 }, // Cache for 5 minutes
  });

  if (!response.ok) {
    console.error(`Odds API error: ${response.status}`);
    return [];
  }

  const data: OddsAPIResponse[] = await response.json();

  return data
    .map((game) => {
      // Find first bookmaker with h2h market (prefer DraftKings or FanDuel)
      const preferredBooks = ["draftkings", "fanduel", "betmgm"];
      const bookmaker =
        game.bookmakers.find((b) => preferredBooks.includes(b.key)) || game.bookmakers[0];

      if (!bookmaker) {
        return null;
      }

      const h2hMarket = bookmaker.markets.find((m) => m.key === "h2h");
      if (!h2hMarket) {
        return null;
      }

      const homeOutcome = h2hMarket.outcomes.find((o) => o.name === game.home_team);
      const awayOutcome = h2hMarket.outcomes.find((o) => o.name === game.away_team);

      if (!homeOutcome || !awayOutcome) {
        return null;
      }

      const rawHomeProb = convertMoneylineToProb(homeOutcome.price);
      const rawAwayProb = convertMoneylineToProb(awayOutcome.price);
      const { home: homeWinProb, away: awayWinProb } = removeVig(rawHomeProb, rawAwayProb);

      const homeTeam = normalizeTeamName(game.home_team);
      const awayTeam = normalizeTeamName(game.away_team);

      if (!homeTeam || !awayTeam) {
        console.warn(`Could not normalize teams: ${game.home_team} vs ${game.away_team}`);
        return null;
      }

      return {
        homeTeam,
        awayTeam,
        homeWinProb,
        awayWinProb,
        homeMoneyline: homeOutcome.price,
        awayMoneyline: awayOutcome.price,
        commenceTime: new Date(game.commence_time),
      };
    })
    .filter((g): g is GameOdds => g !== null);
}

/**
 * Get win probability for a specific team
 */
export function getTeamWinProb(odds: GameOdds[], team: string): number | null {
  for (const game of odds) {
    if (game.homeTeam === team) {
      return game.homeWinProb;
    }
    if (game.awayTeam === team) {
      return game.awayWinProb;
    }
  }
  return null;
}

/**
 * Get opponent for a specific team
 */
export function getTeamOpponent(odds: GameOdds[], team: string): string | null {
  for (const game of odds) {
    if (game.homeTeam === team) {
      return game.awayTeam;
    }
    if (game.awayTeam === team) {
      return game.homeTeam;
    }
  }
  return null;
}
