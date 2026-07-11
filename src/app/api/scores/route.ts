import { NextResponse } from "next/server";
import {
  fetchAllPlayoffStats,
  parsePlayerStats,
  parseDefenseStats,
  calculateTotalPoints,
} from "@/lib/espn";
import { normalizeName } from "@/lib/utils/names";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/scores
 * Fetch live scores from ESPN for all playoff games
 * Query params:
 *   - weeks: comma-separated list of weeks (default: 1,2,3,5)
 *   - player: optional player name to filter
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const weeksParam = searchParams.get("weeks");
    const playerFilter = searchParams.get("player");

    const weeks = weeksParam ? weeksParam.split(",").map((w) => parseInt(w.trim())) : [1, 2, 3, 5];

    // Fetch all games
    const allGames = await fetchAllPlayoffStats(weeks);

    // Parse stats from each game
    const playerStatsByWeek = new Map<number, Map<string, { name: string; points: number }>>();
    const defenseStatsByWeek = new Map<number, Map<string, { name: string; points: number }>>();

    for (const { week, summary } of allGames) {
      // Players
      const playerStats = parsePlayerStats(summary);
      calculateTotalPoints(playerStats);

      if (!playerStatsByWeek.has(week)) {
        playerStatsByWeek.set(week, new Map());
      }
      const weekPlayers = playerStatsByWeek.get(week)!;
      for (const [key, player] of playerStats) {
        if (weekPlayers.has(key)) {
          weekPlayers.get(key)!.points += player.totalPoints;
        } else {
          weekPlayers.set(key, { name: player.name, points: player.totalPoints });
        }
      }

      // Defense
      const defenseStats = parseDefenseStats(summary);
      if (!defenseStatsByWeek.has(week)) {
        defenseStatsByWeek.set(week, new Map());
      }
      const weekDefense = defenseStatsByWeek.get(week)!;
      for (const [key, defense] of defenseStats) {
        if (weekDefense.has(key)) {
          weekDefense.get(key)!.points += defense.totalPoints;
        } else {
          weekDefense.set(key, {
            name: `${defense.abbreviation} DST`,
            points: defense.totalPoints,
          });
        }
      }
    }

    // Aggregate total points across all weeks
    const totalPlayerPoints = new Map<
      string,
      { name: string; totalPoints: number; weeklyPoints: { week: number; points: number }[] }
    >();

    for (const [week, players] of playerStatsByWeek) {
      for (const [key, player] of players) {
        if (!totalPlayerPoints.has(key)) {
          totalPlayerPoints.set(key, {
            name: player.name,
            totalPoints: 0,
            weeklyPoints: [],
          });
        }
        const entry = totalPlayerPoints.get(key)!;
        entry.totalPoints += player.points;
        entry.weeklyPoints.push({ week, points: Math.round(player.points * 100) / 100 });
      }
    }

    // Add defense to total points
    for (const [week, defenses] of defenseStatsByWeek) {
      for (const [key, defense] of defenses) {
        if (!totalPlayerPoints.has(key)) {
          totalPlayerPoints.set(key, {
            name: defense.name,
            totalPoints: 0,
            weeklyPoints: [],
          });
        }
        const entry = totalPlayerPoints.get(key)!;
        entry.totalPoints += defense.points;
        entry.weeklyPoints.push({ week, points: Math.round(defense.points * 100) / 100 });
      }
    }

    // Convert to array and sort by total points
    let results = Array.from(totalPlayerPoints.values()).map((p) => ({
      name: p.name,
      totalPoints: Math.round(p.totalPoints * 100) / 100,
      weeklyPoints: p.weeklyPoints.sort((a, b) => a.week - b.week),
    }));

    // Filter by player if specified
    if (playerFilter) {
      const normalized = normalizeName(playerFilter);
      results = results.filter((p) => normalizeName(p.name).includes(normalized));
    }

    // Sort by total points descending
    results.sort((a, b) => b.totalPoints - a.totalPoints);

    return NextResponse.json({
      success: true,
      data: results,
      meta: {
        weeks,
        playerCount: results.length,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching scores:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch scores",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
