import { PropType } from "@prisma/client";
import { normalizeTeamName, ABBREVIATION_TO_FULL } from "../odds/team-mapping";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

// The Odds API player props response structure
export interface OddsAPIPlayerProp {
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
      last_update: string;
      outcomes: {
        name: string; // Player name or "Over"/"Under"
        description?: string; // Player name for o/u props
        price: number; // American odds
        point?: number; // The line (e.g., 250.5 yards)
      }[];
    }[];
  }[];
}

// Parsed player prop
export interface PlayerProp {
  playerName: string;
  team: string | null;
  propType: PropType;
  line: number;
  overOdds: number;
  underOdds: number;
  impliedOver: number;
  bookmaker: string;
  eventId: string | null;
  gameTime: Date;
  homeTeam: string;
  awayTeam: string;
}

// Map Odds API market keys to our PropType enum
const MARKET_TO_PROP_TYPE: Record<string, PropType> = {
  player_pass_yds: "PASS_YARDS",
  player_pass_tds: "PASS_TDS",
  player_rush_yds: "RUSH_YARDS",
  player_reception_yds: "REC_YARDS",
  player_receptions: "RECEPTIONS",
  player_anytime_td: "ANYTIME_TD",
};

// Preferred bookmakers in order of preference
const PREFERRED_BOOKMAKERS = ["draftkings", "fanduel", "betmgm", "bovada"];

/**
 * Convert American odds to implied probability
 * Negative odds (favorite): probability = |odds| / (|odds| + 100)
 * Positive odds (underdog): probability = 100 / (odds + 100)
 */
export function convertOddsToImplied(americanOdds: number): number {
  if (americanOdds < 0) {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  } else {
    return 100 / (americanOdds + 100);
  }
}

/**
 * Convert anytime TD odds to probability (accounting for vig)
 * Anytime TD is typically just "Yes" odds, need to estimate "No" odds
 */
export function calculateTdProbability(tdOdds: number): number {
  // For anytime TD, we typically only get the "Yes" price
  // Estimate "No" by assuming ~5-8% vig
  const yesProb = convertOddsToImplied(tdOdds);
  // Remove estimated vig (assume total probs sum to ~1.08)
  const adjustedProb = yesProb / 1.08;
  return Math.min(adjustedProb, 0.95); // Cap at 95%
}

/**
 * Normalize probability by removing vig
 */
export function removeVig(overProb: number, underProb: number): number {
  const total = overProb + underProb;
  return overProb / total;
}

/**
 * Fetch all NFL events (games) from The Odds API
 */
export async function fetchNFLEvents(): Promise<
  { id: string; home_team: string; away_team: string; commence_time: string }[]
> {
  const apiKey = process.env.THE_ODDS_API_KEY;

  if (!apiKey) {
    console.warn("THE_ODDS_API_KEY not set, cannot fetch events");
    return [];
  }

  const url = `${ODDS_API_BASE}/sports/americanfootball_nfl/events?apiKey=${apiKey}`;

  const response = await fetch(url, {
    next: { revalidate: 3600 }, // Cache for 1 hour
  });

  if (!response.ok) {
    console.error(`Events API error: ${response.status}`);
    return [];
  }

  return response.json();
}

/**
 * Fetch player props for a specific event (game)
 */
export async function fetchPlayerPropsForEvent(eventId: string): Promise<PlayerProp[]> {
  const apiKey = process.env.THE_ODDS_API_KEY;

  if (!apiKey) {
    console.warn("THE_ODDS_API_KEY not set, cannot fetch player props");
    return [];
  }

  const markets = [
    "player_pass_yds",
    "player_pass_tds",
    "player_rush_yds",
    "player_reception_yds",
    "player_receptions",
    "player_anytime_td",
  ].join(",");

  const url = `${ODDS_API_BASE}/sports/americanfootball_nfl/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${markets}&oddsFormat=american`;

  const response = await fetch(url, {
    next: { revalidate: 21600 }, // Cache for 6 hours (cost saving)
  });

  if (!response.ok) {
    console.error(`Player props API error for event ${eventId}: ${response.status}`);
    return [];
  }

  const data: OddsAPIPlayerProp = await response.json();
  return parsePlayerProps(data, eventId);
}

/**
 * Parse the Odds API response into our PlayerProp format
 */
function parsePlayerProps(data: OddsAPIPlayerProp, eventId: string): PlayerProp[] {
  const props: PlayerProp[] = [];
  const homeTeam = normalizeTeamName(data.home_team);
  const awayTeam = normalizeTeamName(data.away_team);

  if (!homeTeam || !awayTeam) {
    console.warn(`Could not normalize teams: ${data.home_team} vs ${data.away_team}`);
    return [];
  }

  for (const bookmaker of data.bookmakers) {
    // Skip non-preferred bookmakers if we have enough data
    if (!PREFERRED_BOOKMAKERS.includes(bookmaker.key)) {
      continue;
    }

    for (const market of bookmaker.markets) {
      const propType = MARKET_TO_PROP_TYPE[market.key];
      if (!propType) {
        continue; // Skip unsupported market types
      }

      if (propType === "ANYTIME_TD") {
        // Anytime TD has different structure - outcomes are player names with "Yes" prices
        for (const outcome of market.outcomes) {
          if (outcome.name && outcome.price) {
            const tdProb = calculateTdProbability(outcome.price);
            props.push({
              playerName: outcome.name,
              team: guessPlayerTeam(outcome.name, homeTeam, awayTeam),
              propType,
              line: tdProb, // Store probability as the "line" for TD props
              overOdds: outcome.price,
              underOdds: 0, // Not available for anytime TD
              impliedOver: tdProb,
              bookmaker: bookmaker.key,
              eventId,
              gameTime: new Date(data.commence_time),
              homeTeam,
              awayTeam,
            });
          }
        }
      } else {
        // Standard O/U props
        const playerOutcomes = new Map<
          string,
          { over?: { price: number; point: number }; under?: { price: number; point: number } }
        >();

        for (const outcome of market.outcomes) {
          const playerName = outcome.description || outcome.name;
          if (!playerName || !outcome.point) continue;

          const existing = playerOutcomes.get(playerName) || {};
          if (outcome.name === "Over") {
            existing.over = { price: outcome.price, point: outcome.point };
          } else if (outcome.name === "Under") {
            existing.under = { price: outcome.price, point: outcome.point };
          }
          playerOutcomes.set(playerName, existing);
        }

        for (const [playerName, outcomes] of playerOutcomes) {
          if (outcomes.over && outcomes.under) {
            const overProb = convertOddsToImplied(outcomes.over.price);
            const underProb = convertOddsToImplied(outcomes.under.price);
            const impliedOver = removeVig(overProb, underProb);

            props.push({
              playerName,
              team: guessPlayerTeam(playerName, homeTeam, awayTeam),
              propType,
              line: outcomes.over.point,
              overOdds: outcomes.over.price,
              underOdds: outcomes.under.price,
              impliedOver,
              bookmaker: bookmaker.key,
              eventId,
              gameTime: new Date(data.commence_time),
              homeTeam,
              awayTeam,
            });
          }
        }
      }
    }
  }

  return props;
}

/**
 * Attempt to guess which team a player is on based on common knowledge
 * This is a simple heuristic - real matching happens in the sync endpoint
 */
function guessPlayerTeam(playerName: string, homeTeam: string, awayTeam: string): string | null {
  // This function is a placeholder - actual team matching happens when
  // we match props to database players who have team assignments
  return null;
}

/**
 * Normalize player name for matching
 * Handles common variations: "Patrick Mahomes" vs "Patrick Mahomes II"
 */
export function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i, "") // Remove suffixes
    .replace(/[.']/g, "") // Remove periods and apostrophes
    .trim();
}

/**
 * Match a prop player name to a database player
 */
export function matchPlayerName(
  propName: string,
  dbPlayers: { id: string; name: string; team: string | null }[]
): { id: string; name: string; team: string | null } | null {
  const normalizedProp = normalizePlayerName(propName);

  // Try exact match first
  for (const player of dbPlayers) {
    if (normalizePlayerName(player.name) === normalizedProp) {
      return player;
    }
  }

  // Try partial match (first + last name)
  const propParts = normalizedProp.split(" ");
  if (propParts.length >= 2) {
    const firstName = propParts[0];
    const lastName = propParts[propParts.length - 1];

    for (const player of dbPlayers) {
      const playerNorm = normalizePlayerName(player.name);
      const playerParts = playerNorm.split(" ");
      if (playerParts.length >= 2) {
        const pFirstName = playerParts[0];
        const pLastName = playerParts[playerParts.length - 1];

        if (firstName === pFirstName && lastName === pLastName) {
          return player;
        }
      }
    }
  }

  return null;
}

/**
 * Fetch all player props for upcoming NFL games
 * This is the main entry point for syncing props
 */
export async function fetchAllNFLPlayerProps(): Promise<PlayerProp[]> {
  const events = await fetchNFLEvents();
  const allProps: PlayerProp[] = [];

  // Only fetch props for games starting in the next 7 days
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const upcomingEvents = events.filter((event) => {
    const gameTime = new Date(event.commence_time);
    return gameTime > now && gameTime < weekFromNow;
  });

  console.log(`Fetching props for ${upcomingEvents.length} upcoming NFL events`);

  for (const event of upcomingEvents) {
    try {
      const props = await fetchPlayerPropsForEvent(event.id);
      allProps.push(...props);
      console.log(`Fetched ${props.length} props for ${event.home_team} vs ${event.away_team}`);
    } catch (error) {
      console.error(`Error fetching props for event ${event.id}:`, error);
    }
  }

  return allProps;
}
