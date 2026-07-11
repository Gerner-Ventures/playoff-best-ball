import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR, BYE_TEAMS_2025 } from "@/lib/constants";
import { getEliminatedTeams } from "@/lib/espn/client";
import { Position, EnhancedProjectionBreakdown } from "@/types";
import {
  advancedBlendProjections,
  aggregatePlayerProps,
  PropProjection,
} from "@/lib/props/calculator";
import { fetchStadiumWeather, GameWeatherData } from "@/lib/weather/client";

export const dynamic = "force-dynamic";

// Playoff weeks: 1=Wild Card, 2=Divisional, 3=Conference, 5=Super Bowl
const PLAYOFF_WEEKS = [1, 2, 3, 5];

interface WeekProjection {
  week: number;
  weekName: string;
  projectedPoints: number;
  advanceProb: number;
  expectedValue: number;
}

interface PlayerPlayoffProjection {
  id: string;
  name: string;
  position: string;
  team: string | null;
  slot: string;
  actualPoints: number;
  avgPointsPerGame: number;
  gamesPlayed: number;
  weeklyBreakdown: WeekProjection[];
  totalRemainingEV: number;
  champProb: number | null;
  // Enhanced breakdown (when includeBreakdown=true)
  breakdown?: EnhancedProjectionBreakdown;
  // Source indicators
  source?: "prop" | "historical" | "blended";
  propCount?: number;
  confidence?: "high" | "medium" | "low";
}

interface OwnerPlayoffProjection {
  ownerId: string;
  ownerName: string;
  players: PlayerPlayoffProjection[];
  actualPoints: number;
  totalRemainingEV: number;
  totalProjectedPoints: number;
  activePlayers: number;
  eliminatedPlayers: number;
}

/**
 * GET /api/projections/playoffs
 * Get cumulative rest-of-playoffs projections for all owners
 *
 * Query params:
 * - year: Season year (default: current)
 * - currentWeek: Override current week detection
 * - includeBreakdown: Include full projection breakdown (default: false)
 * - useEnhanced: Use prop-based projections when available (default: true)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const includeBreakdown = url.searchParams.get("includeBreakdown") === "true";
    const useEnhanced = url.searchParams.get("useEnhanced") !== "false"; // Default true

    // Get eliminated teams
    const eliminatedTeams = await getEliminatedTeams();
    const eliminatedCount = eliminatedTeams.size;

    // Determine current week based on how many teams are eliminated
    // NFL Playoffs: 14 teams start, eliminate 6 in WC, 4 in Div, 2 in Conf, 1 in SB
    // After Wild Card: 6 eliminated (8 remain)
    // After Divisional: 10 eliminated (4 remain)
    // After Conference: 12 eliminated (2 remain)
    // After Super Bowl: 13 eliminated (1 remains)
    let currentWeek: number;
    let completedWeeks: number[];
    let remainingWeeks: number[];

    if (eliminatedCount < 6) {
      // Wild Card not complete
      currentWeek = 1;
      completedWeeks = [];
      remainingWeeks = [1, 2, 3, 5];
    } else if (eliminatedCount < 10) {
      // Wild Card complete, Divisional in progress or upcoming
      currentWeek = 2;
      completedWeeks = [1];
      remainingWeeks = [2, 3, 5];
    } else if (eliminatedCount < 12) {
      // Divisional complete, Conference in progress or upcoming
      currentWeek = 3;
      completedWeeks = [1, 2];
      remainingWeeks = [3, 5];
    } else if (eliminatedCount < 13) {
      // Conference complete, Super Bowl upcoming
      currentWeek = 5;
      completedWeeks = [1, 2, 3];
      remainingWeeks = [5];
    } else {
      // Playoffs complete
      currentWeek = 5;
      completedWeeks = [1, 2, 3, 5];
      remainingWeeks = [];
    }

    // Allow manual override via query param
    const weekOverride = url.searchParams.get("currentWeek");
    if (weekOverride) {
      const overrideWeek = parseInt(weekOverride);
      if (PLAYOFF_WEEKS.includes(overrideWeek)) {
        currentWeek = overrideWeek;
        const weekIndex = PLAYOFF_WEEKS.indexOf(overrideWeek);
        completedWeeks = PLAYOFF_WEEKS.slice(0, weekIndex);
        remainingWeeks = PLAYOFF_WEEKS.slice(weekIndex);
      }
    }

    // Get all team odds for remaining weeks
    const allOdds = await prisma.teamOdds.findMany({
      where: { year, week: { in: remainingWeeks.length > 0 ? remainingWeeks : [currentWeek] } },
    });

    // Build odds map: team -> week -> winProb
    const oddsMap = new Map<string, Map<number, number>>();
    for (const odd of allOdds) {
      if (!oddsMap.has(odd.team)) {
        oddsMap.set(odd.team, new Map());
      }
      oddsMap.get(odd.team)!.set(odd.week, odd.winProb);
    }

    // Bye teams: teams that skip Wild Card (first-round bye)
    // Use the configured bye teams for the current season
    const byeTeams = new Set(BYE_TEAMS_2025);

    // Get all owners with rosters, scores, projections, and props
    const owners = await prisma.owner.findMany({
      include: {
        rosters: {
          where: { year },
          include: {
            player: {
              include: {
                scores: {
                  where: { year },
                  orderBy: { week: "asc" },
                },
                projections: {
                  where: { year },
                },
                props: useEnhanced
                  ? {
                      where: { year, week: currentWeek },
                      orderBy: { updatedAt: "desc" },
                    }
                  : undefined,
              },
            },
          },
        },
      },
    });

    // Fetch weather data for teams with games this week (if using enhanced projections)
    const weatherCache = new Map<string, GameWeatherData | null>();
    if (useEnhanced) {
      // Get unique teams still in playoffs
      const teamsInPlayoffs = new Set<string>();
      for (const owner of owners) {
        for (const roster of owner.rosters) {
          const team = roster.player.team?.toUpperCase();
          if (team && !eliminatedTeams.has(team) && !byeTeams.has(team)) {
            teamsInPlayoffs.add(team);
          }
        }
      }
      // Fetch weather for each team (async parallel)
      const weatherPromises = Array.from(teamsInPlayoffs).map(async (team) => {
        try {
          // Use a default game time (afternoon kickoff)
          const gameDate = new Date();
          gameDate.setHours(16, 30, 0, 0); // 4:30 PM
          const weather = await fetchStadiumWeather(team, gameDate);
          weatherCache.set(team, weather);
        } catch {
          weatherCache.set(team, null);
        }
      });
      await Promise.all(weatherPromises);
    }

    const weekNames: Record<number, string> = {
      1: "Wild Card",
      2: "Divisional",
      3: "Conference",
      5: "Super Bowl",
    };

    // Calculate projections for each owner
    const projections: OwnerPlayoffProjection[] = owners.map((owner) => {
      let ownerTotalEV = 0;
      let ownerTotalProjected = 0;
      let activePlayers = 0;
      let eliminatedPlayers = 0;

      const players: PlayerPlayoffProjection[] = owner.rosters.map((roster) => {
        const player = roster.player;
        const playerTeam = (player.team || "").toUpperCase();
        const isEliminated = eliminatedTeams.has(playerTeam);

        if (isEliminated) {
          eliminatedPlayers++;
        } else {
          activePlayers++;
        }

        // Calculate actual points
        const actualPoints = player.scores.reduce((sum, s) => sum + s.points, 0);
        const gamesPlayed = player.scores.filter((s) => s.points > 0).length;

        // Get props for enhanced projection
        const playerProps =
          (player as { props?: { propType: string; line: number; updatedAt: Date }[] }).props || [];
        const propData =
          playerProps.length > 0
            ? aggregatePlayerProps(
                playerProps.map((p) => ({
                  propType: p.propType as import("@prisma/client").PropType,
                  line: p.line,
                })),
                player.position as Position
              )
            : { points: null, propCount: 0, projection: {} as PropProjection };

        // Get weather for this player's team
        const weather = weatherCache.get(playerTeam) ?? null;

        // Get team's win probability for current week
        const teamOddsForWeek = oddsMap.get(playerTeam);
        const weekWinProb = teamOddsForWeek?.get(currentWeek) ?? null;

        // Use enhanced projection if enabled and we have data
        let avgPointsPerGame: number;
        let projectionBreakdown: EnhancedProjectionBreakdown | undefined;
        let projectionSource: "prop" | "historical" | "blended" | undefined;
        let projectionConfidence: "high" | "medium" | "low" | undefined;

        if (useEnhanced && (propData.propCount > 0 || gamesPlayed > 0)) {
          const enhancedResult = advancedBlendProjections(
            {
              points: propData.points,
              propCount: propData.propCount,
              props: propData.projection,
              updatedAt: playerProps[0]?.updatedAt,
            },
            {
              scores: player.scores.map((s) => ({ week: s.week, points: s.points })),
            },
            player.position as Position,
            weather,
            weekWinProb
          );

          avgPointsPerGame = enhancedResult.projectedPoints;
          projectionSource =
            enhancedResult.sources.propWeight > 0.5
              ? enhancedResult.sources.historicalWeight > 0
                ? "blended"
                : "prop"
              : "historical";
          projectionConfidence = enhancedResult.confidence.level;

          if (includeBreakdown) {
            projectionBreakdown = enhancedResult;
          }
        } else {
          // Fallback to simple average
          avgPointsPerGame =
            gamesPlayed > 0 ? actualPoints / gamesPlayed : getPositionAverage(player.position);
          projectionSource = gamesPlayed > 0 ? "historical" : undefined;
          projectionConfidence = gamesPlayed >= 2 ? "medium" : "low";
        }

        // Calculate week-by-week EV for remaining weeks
        const weeklyBreakdown: WeekProjection[] = [];
        let totalRemainingEV = 0;
        let cumulativeAdvanceProb = 1;

        if (!isEliminated && playerTeam) {
          const teamOdds = oddsMap.get(playerTeam);
          const hasBye = byeTeams.has(playerTeam);

          for (const week of remainingWeeks) {
            // Handle bye teams: they don't play Wild Card
            if (week === 1 && hasBye) {
              // Bye team in Wild Card: automatically advances, no game played
              weeklyBreakdown.push({
                week,
                weekName: weekNames[week] + " (BYE)",
                projectedPoints: 0,
                advanceProb: 1.0, // Automatic advance
                expectedValue: 0, // No game, no points
              });
              // cumulativeAdvanceProb stays at 1.0
              continue;
            }

            // Get win probability for this week
            // If no odds, estimate based on remaining teams (assume equal chance)
            const weekWinProb = teamOdds?.get(week) ?? 0.5;

            // Advance probability is cumulative (must win all previous games)
            const advanceProb = cumulativeAdvanceProb * weekWinProb;
            const weekEV = avgPointsPerGame * advanceProb;

            weeklyBreakdown.push({
              week,
              weekName: weekNames[week],
              projectedPoints: avgPointsPerGame,
              advanceProb,
              expectedValue: Math.round(weekEV * 100) / 100,
            });

            totalRemainingEV += weekEV;
            cumulativeAdvanceProb = advanceProb; // Update for next round
          }
        }

        ownerTotalEV += totalRemainingEV;
        ownerTotalProjected += avgPointsPerGame * remainingWeeks.length;

        // Championship probability (probability of making Super Bowl)
        const champProb =
          !isEliminated && weeklyBreakdown.length > 0
            ? (weeklyBreakdown[weeklyBreakdown.length - 1]?.advanceProb ?? null)
            : null;

        return {
          id: player.id,
          name: player.name,
          position: player.position,
          team: player.team,
          slot: roster.rosterSlot,
          actualPoints,
          avgPointsPerGame: Math.round(avgPointsPerGame * 100) / 100,
          gamesPlayed,
          weeklyBreakdown,
          totalRemainingEV: Math.round(totalRemainingEV * 100) / 100,
          champProb: champProb ? Math.round(champProb * 1000) / 1000 : null,
          // Enhanced projection data
          breakdown: projectionBreakdown,
          source: projectionSource,
          propCount: propData.propCount,
          confidence: projectionConfidence,
        };
      });

      // Sort players by total remaining EV
      players.sort((a, b) => b.totalRemainingEV - a.totalRemainingEV);

      const actualPoints = players.reduce((sum, p) => sum + p.actualPoints, 0);

      return {
        ownerId: owner.id,
        ownerName: owner.name,
        players,
        actualPoints,
        totalRemainingEV: Math.round(ownerTotalEV * 100) / 100,
        totalProjectedPoints: Math.round(ownerTotalProjected * 100) / 100,
        activePlayers,
        eliminatedPlayers,
      };
    });

    // Sort owners by total expected value (actual + remaining EV)
    projections.sort(
      (a, b) => b.actualPoints + b.totalRemainingEV - (a.actualPoints + a.totalRemainingEV)
    );

    // Calculate prop coverage stats
    let playersWithProps = 0;
    let totalPlayers = 0;
    for (const proj of projections) {
      for (const player of proj.players) {
        totalPlayers++;
        if (player.propCount && player.propCount > 0) {
          playersWithProps++;
        }
      }
    }

    return NextResponse.json({
      projections,
      completedWeeks,
      remainingWeeks,
      currentWeek,
      year,
      eliminatedTeams: Array.from(eliminatedTeams),
      eliminatedCount,
      byeTeams: Array.from(byeTeams),
      oddsCount: allOdds.length,
      lastUpdated: new Date().toISOString(),
      // Enhanced projection metadata
      enhanced: {
        enabled: useEnhanced,
        includeBreakdown,
        propCoverage: {
          playersWithProps,
          totalPlayers,
          percentage: totalPlayers > 0 ? Math.round((playersWithProps / totalPlayers) * 100) : 0,
        },
        weatherDataAvailable: weatherCache.size > 0,
      },
    });
  } catch (error) {
    console.error("Error fetching playoff projections:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch playoff projections",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Position averages for players with no games played
function getPositionAverage(position: string): number {
  const averages: Record<string, number> = {
    QB: 18.5,
    RB: 12.0,
    WR: 11.5,
    TE: 8.0,
    K: 7.5,
    DST: 7.0,
  };
  return averages[position] ?? 10;
}
