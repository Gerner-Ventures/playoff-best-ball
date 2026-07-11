import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR, BYE_TEAMS_2025 } from "@/lib/constants";
import { getEliminatedTeams } from "@/lib/espn/client";

export const dynamic = "force-dynamic";

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

/**
 * GET /api/projections
 * Get player projections with expected values for a single week
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const week = url.searchParams.get("week") ? parseInt(url.searchParams.get("week")!) : 1;

    // Get eliminated teams
    const eliminatedTeams = await getEliminatedTeams();
    const byeTeams = new Set(BYE_TEAMS_2025);

    // Get all owners with their rosters, player scores, and substitutions
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
              },
            },
            substitutions: {
              where: { year },
              include: {
                substitutePlayer: {
                  include: {
                    scores: {
                      where: { year },
                      orderBy: { week: "asc" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Get team odds for this week (filtering out bye teams for Wild Card)
    const teamOdds = await prisma.teamOdds.findMany({
      where: { year, week },
    });

    // Filter odds: in Wild Card, bye teams don't play (and games against bye teams aren't WC games)
    const filteredOdds =
      week === 1
        ? teamOdds.filter((o) => !byeTeams.has(o.team) && !byeTeams.has(o.opponent))
        : teamOdds;

    const oddsMap = new Map(filteredOdds.map((o) => [o.team, o]));

    // Transform data for projection view
    const projections = owners.map((owner) => {
      const players = owner.rosters.map((roster) => {
        const substitution = roster.substitutions[0]; // At most one per roster per year
        const hasSubstitution = !!substitution;
        const isInjured = hasSubstitution && week >= substitution.effectiveWeek;

        // For injured players, use combined scoring; for substitutes, use their scores from effectiveWeek
        let actualPoints: number;
        let activePlayer: {
          name: string;
          team: string | null;
          position: string;
          scores: { week: number; points: number }[];
        };

        if (isInjured) {
          // Original player's points before effectiveWeek + substitute's points from effectiveWeek onward
          const originalPointsBefore = roster.player.scores
            .filter((s) => s.week < substitution.effectiveWeek)
            .reduce((sum, s) => sum + s.points, 0);
          const substitutePointsAfter = substitution.substitutePlayer.scores
            .filter((s) => s.week >= substitution.effectiveWeek)
            .reduce((sum, s) => sum + s.points, 0);
          actualPoints = originalPointsBefore + substitutePointsAfter;

          // Use substitute player for projections going forward
          activePlayer = {
            name: substitution.substitutePlayer.name,
            team: substitution.substitutePlayer.team,
            position: substitution.substitutePlayer.position,
            scores: substitution.substitutePlayer.scores.map((s) => ({
              week: s.week,
              points: s.points,
            })),
          };
        } else {
          actualPoints = roster.player.scores.reduce((sum, s) => sum + s.points, 0);
          activePlayer = {
            name: roster.player.name,
            team: roster.player.team,
            position: roster.player.position,
            scores: roster.player.scores.map((s) => ({ week: s.week, points: s.points })),
          };
        }

        // Use substitute team for odds/elimination if injured
        const playerTeam = (activePlayer.team || roster.player.team || "").toUpperCase();
        const teamOdd = oddsMap.get(playerTeam);
        const isEliminated = eliminatedTeams.has(playerTeam);
        const hasBye = byeTeams.has(playerTeam);

        // Calculate projected points from playoff average
        const gamesPlayed = activePlayer.scores.filter((s) => s.points > 0).length;
        const avgPointsPerGame =
          gamesPlayed > 0 ? actualPoints / gamesPlayed : getPositionAverage(activePlayer.position);
        const projectedPoints = Math.round(avgPointsPerGame * 100) / 100;

        // Calculate expected value
        let expectedValue: number | null = null;
        let winProb: number | null = null;
        const opponent: string | null = teamOdd?.opponent || null;
        let isByeWeek = false;

        if (isEliminated || isInjured) {
          // Eliminated teams or injured (without sub team data) have no EV
          expectedValue =
            isInjured && !isEliminated ? Math.round(projectedPoints * 0.5 * 100) / 100 : null;
        } else if (week === 1 && hasBye) {
          // Bye teams don't play Wild Card - show as BYE
          expectedValue = null;
          isByeWeek = true;
        } else if (teamOdd) {
          // Has odds for this week
          winProb = teamOdd.winProb;
          expectedValue = Math.round(projectedPoints * winProb * 100) / 100;
        } else if (!hasBye || week > 1) {
          // No odds but not eliminated - use 50% default
          winProb = 0.5;
          expectedValue = Math.round(projectedPoints * 0.5 * 100) / 100;
        }

        return {
          id: roster.player.id,
          name: roster.player.name,
          position: roster.player.position,
          team: roster.player.team,
          slot: roster.rosterSlot,
          actualPoints,
          projectedPoints,
          teamWinProb: winProb,
          expectedValue,
          opponent,
          isEliminated,
          isByeWeek,
          weeklyScores: roster.player.scores.map((s) => ({
            week: s.week,
            points: s.points,
          })),
          // Substitution info
          hasSubstitution,
          isInjured,
          substitution: hasSubstitution
            ? {
                effectiveWeek: substitution.effectiveWeek,
                reason: substitution.reason,
                substitutePlayer: {
                  id: substitution.substitutePlayer.id,
                  name: substitution.substitutePlayer.name,
                  team: substitution.substitutePlayer.team,
                },
              }
            : null,
        };
      });

      // Sort players by slot order
      const slotOrder = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX", "K", "DST"];
      players.sort((a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot));

      const totalActual = players.reduce((sum, p) => sum + p.actualPoints, 0);
      const totalProjected = players.reduce((sum, p) => sum + p.projectedPoints, 0);
      const totalEV = players.reduce((sum, p) => sum + (p.expectedValue || 0), 0);

      return {
        ownerId: owner.id,
        ownerName: owner.name,
        players,
        actualPoints: totalActual,
        projectedPoints: totalProjected,
        expectedValue: totalEV,
        totalExpectedValue: totalActual + totalEV,
      };
    });

    // Sort by total expected value
    projections.sort((a, b) => b.totalExpectedValue - a.totalExpectedValue);

    return NextResponse.json({
      projections,
      week,
      year,
      byeTeams: Array.from(byeTeams),
      eliminatedTeams: Array.from(eliminatedTeams),
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching projections:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch projections",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
