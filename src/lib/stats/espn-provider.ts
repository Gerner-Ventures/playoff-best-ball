import type {
  StatsProvider,
  ProviderGame,
  ProviderPlayerStats,
  ProviderPoolPlayer,
} from "@/domain/stats/provider";
import { parseScoreboard, parseGameStats, parseRoster } from "./espn-parse";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

// OUR playoff weeks 1..4 ↔ ESPN seasontype=3 weeks 1,2,3,5 (ESPN week 4 = Pro Bowl).
const ESPN_WEEK: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 5 };

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

export class EspnStatsProvider implements StatsProvider {
  async fetchWeekGames(_season: number, week: number): Promise<ProviderGame[]> {
    const espnWeek = ESPN_WEEK[week];
    if (!espnWeek) throw new Error(`invalid playoff week ${week}`);
    const data = await getJson(`${BASE}/scoreboard?seasontype=3&week=${espnWeek}`);
    return parseScoreboard(data, week);
  }

  async fetchGameStats(eventId: string): Promise<ProviderPlayerStats[]> {
    const data = await getJson(`${BASE}/summary?event=${eventId}`);
    return parseGameStats(data);
  }

  async fetchTeamRoster(_season: number, team: string): Promise<ProviderPoolPlayer[]> {
    const data = await getJson(`${BASE}/teams/${team.toLowerCase()}/roster`);
    return parseRoster(data, team);
  }
}

export const espnProvider = new EspnStatsProvider();
