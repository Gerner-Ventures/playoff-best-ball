import { ESPNScoreboardResponse, ESPNSummaryResponse, ESPNEvent } from "./types";

const ESPN_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

/**
 * Fetch the NFL scoreboard for a specific playoff week
 */
export async function fetchScoreboard(week: number): Promise<ESPNEvent[]> {
  const url = `${ESPN_BASE_URL}/scoreboard?seasontype=3&week=${week}`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 60 }, // Cache for 1 minute
    });

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data: ESPNScoreboardResponse = await response.json();
    return data.events ?? [];
  } catch (error) {
    console.error(`Error fetching scoreboard for week ${week}:`, error);
    return [];
  }
}

/**
 * Fetch detailed game summary (box score, scoring plays)
 */
export async function fetchGameSummary(eventId: string): Promise<ESPNSummaryResponse | null> {
  const url = `${ESPN_BASE_URL}/summary?event=${eventId}`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching game summary for event ${eventId}:`, error);
    return null;
  }
}

/**
 * Fetch all playoff games for the specified weeks
 * Default weeks: Wild Card (1), Divisional (2), Conference (3), Super Bowl (5)
 * Week 4 is Pro Bowl - excluded
 */
export async function fetchAllPlayoffGames(
  weeks: number[] = [1, 2, 3, 5]
): Promise<{ week: number; events: ESPNEvent[] }[]> {
  const results: { week: number; events: ESPNEvent[] }[] = [];

  for (const week of weeks) {
    const events = await fetchScoreboard(week);
    // Filter out Pro Bowl
    const filteredEvents = events.filter((event) => !event.name.toLowerCase().includes("pro bowl"));
    results.push({ week, events: filteredEvents });
  }

  return results;
}

/**
 * Fetch complete stats for all playoff games
 * Returns completion status so consumers can filter incomplete games
 */
export async function fetchAllPlayoffStats(
  weeks: number[] = [1, 2, 3, 5]
): Promise<
  {
    week: number;
    eventId: string;
    summary: ESPNSummaryResponse;
    isCompleted: boolean;
    isInProgress: boolean;
  }[]
> {
  const allGames = await fetchAllPlayoffGames(weeks);
  const results: {
    week: number;
    eventId: string;
    summary: ESPNSummaryResponse;
    isCompleted: boolean;
    isInProgress: boolean;
  }[] = [];

  for (const { week, events } of allGames) {
    for (const event of events) {
      const summary = await fetchGameSummary(event.id);
      if (summary) {
        const isCompleted = event.status?.type?.completed ?? false;
        const isInProgress =
          event.status?.type?.state === "in" ||
          (event.status?.type?.state === "pre" && (event.status?.period ?? 0) > 0);
        results.push({ week, eventId: event.id, summary, isCompleted, isInProgress });
      }
    }
  }

  return results;
}

/**
 * Get a set of eliminated team abbreviations based on completed playoff games
 * A team is eliminated if they lost a completed game
 */
export async function getEliminatedTeams(weeks: number[] = [1, 2, 3, 5]): Promise<Set<string>> {
  const eliminatedTeams = new Set<string>();
  const allGames = await fetchAllPlayoffGames(weeks);

  for (const { events } of allGames) {
    for (const event of events) {
      // Only consider completed games
      if (!event.status.type.completed) continue;

      const competition = event.competitions[0];
      if (!competition || competition.competitors.length !== 2) continue;

      const [team1, team2] = competition.competitors;
      const score1 = parseInt(team1.score) || 0;
      const score2 = parseInt(team2.score) || 0;

      // The losing team is eliminated
      if (score1 > score2) {
        eliminatedTeams.add(team2.team.abbreviation.toUpperCase());
      } else if (score2 > score1) {
        eliminatedTeams.add(team1.team.abbreviation.toUpperCase());
      }
      // Tie games (rare in playoffs) - neither eliminated
    }
  }

  return eliminatedTeams;
}
