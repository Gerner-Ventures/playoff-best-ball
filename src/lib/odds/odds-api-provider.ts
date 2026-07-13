import type { GameOdds, OddsProvider } from "@/domain/odds/provider";
import { moneylineToProb, removeVig } from "@/domain/odds/implied-probability";
import { normalizeTeamName } from "./team-mapping";

const BASE = "https://api.the-odds-api.com/v4";

// The prototype preferred the big books over whatever bookmaker came back first.
const PREFERRED_BOOKS = ["draftkings", "fanduel", "betmgm"];

interface OddsApiGame {
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: Array<{
    key: string;
    markets: Array<{ key: string; outcomes: Array<{ name: string; price: number }> }>;
  }>;
}

/**
 * The Odds API adapter (free tier: 500 req/mo — one daily sync uses ~30/season).
 * Ported from the prototype's odds client: prefer DraftKings/FanDuel/BetMGM,
 * else the first bookmaker; take its h2h moneylines and remove the vig.
 */
export class OddsApiProvider implements OddsProvider {
  constructor(private readonly apiKey: string) {}

  async fetchUpcomingOdds(): Promise<GameOdds[]> {
    const url = `${BASE}/sports/americanfootball_nfl/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=${this.apiKey}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`odds api ${res.status}`);
    const games = (await res.json()) as OddsApiGame[];
    const out: GameOdds[] = [];
    for (const g of games) {
      const bookmaker =
        g.bookmakers.find((b) => PREFERRED_BOOKS.includes(b.key)) ?? g.bookmakers[0];
      const market = bookmaker?.markets.find((m) => m.key === "h2h");
      const home = market?.outcomes.find((o) => o.name === g.home_team);
      const away = market?.outcomes.find((o) => o.name === g.away_team);
      if (!home || !away) continue;
      const [homeWinProb, awayWinProb] = removeVig(
        moneylineToProb(home.price),
        moneylineToProb(away.price),
      );
      out.push({
        homeTeam: normalizeTeamName(g.home_team),
        awayTeam: normalizeTeamName(g.away_team),
        homeWinProb,
        awayWinProb,
        homeMoneyline: home.price,
        awayMoneyline: away.price,
        commenceTime: new Date(g.commence_time),
      });
    }
    return out;
  }
}

export const oddsProvider: OddsProvider | null = process.env.ODDS_API_KEY
  ? new OddsApiProvider(process.env.ODDS_API_KEY)
  : null;
