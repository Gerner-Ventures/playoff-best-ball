import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR, BYE_TEAMS_2025 } from "@/lib/constants";
import { getEliminatedTeams } from "@/lib/espn/client";
import { Position } from "@/types";
import {
  aggregatePlayerProps,
  blendProjections,
  calculateExpectedValue,
  getPositionBaseline,
} from "@/lib/props/calculator";

export const dynamic = "force-dynamic";

/**
 * GET /api/projections/enhanced
 * Get enhanced player projections using prop-based data blended with historical
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const week = url.searchParams.get("week") ? parseInt(url.searchParams.get("week")!) : 2;

    // Get eliminated teams
    const eliminatedTeams = await getEliminatedTeams();
    const byeTeams = new Set(BYE_TEAMS_2025);

    // Get all owners with their rosters, player scores, substitutions, and props
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
                props: {
                  where: { year, week },
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
                    props: {
                      where: { year, week },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Get team odds for this week
    const teamOdds = await prisma.teamOdds.findMany({
      where: { year, week },
    });

    // Filter odds: in Wild Card, bye teams don't play
    const filteredOdds =
      week === 1
        ? teamOdds.filter((o) => !byeTeams.has(o.team) && !byeTeams.has(o.opponent))
        : teamOdds;

    const oddsMap = new Map(filteredOdds.map((o) => [o.team, o]));

    // Transform data for enhanced projection view
    const projections = owners.map((owner) => {
      const players = owner.rosters.map((roster) => {
        const substitution = roster.substitutions[0];
        const hasSubstitution = !!substitution;
        const isInjured = hasSubstitution && week >= substitution.effectiveWeek;

        // Determine active player (original or substitute)
        let activePlayer: {
          id: string;
          name: string;
          team: string | null;
          position: Position;
          scores: { week: number; points: number }[];
          props: { propType: string; line: number }[];
        };
        let actualPoints: number;

        if (isInjured) {
          // Use substitute player for projections
          const originalPointsBefore = roster.player.scores
            .filter((s) => s.week < substitution.effectiveWeek)
            .reduce((sum, s) => sum + s.points, 0);
          const substitutePointsAfter = substitution.substitutePlayer.scores
            .filter((s) => s.week >= substitution.effectiveWeek)
            .reduce((sum, s) => sum + s.points, 0);
          actualPoints = originalPointsBefore + substitutePointsAfter;

          activePlayer = {
            id: substitution.substitutePlayer.id,
            name: substitution.substitutePlayer.name,
            team: substitution.substitutePlayer.team,
            position: substitution.substitutePlayer.position as Position,
            scores: substitution.substitutePlayer.scores.map((s) => ({
              week: s.week,
              points: s.points,
            })),
            props: substitution.substitutePlayer.props.map((p) => ({
              propType: p.propType,
              line: p.line,
            })),
          };
        } else {
          actualPoints = roster.player.scores.reduce((sum, s) => sum + s.points, 0);
          activePlayer = {
            id: roster.player.id,
            name: roster.player.name,
            team: roster.player.team,
            position: roster.player.position as Position,
            scores: roster.player.scores.map((s) => ({ week: s.week, points: s.points })),
            props: roster.player.props.map((p) => ({
              propType: p.propType,
              line: p.line,
            })),
          };
        }

        const playerTeam = (activePlayer.team || roster.player.team || "").toUpperCase();
        const teamOdd = oddsMap.get(playerTeam);
        const isEliminated = eliminatedTeams.has(playerTeam);
        const hasBye = byeTeams.has(playerTeam);

        // Calculate historical projection (games played average)
        const gamesPlayed = activePlayer.scores.filter((s) => s.points > 0).length;
        const historicalPoints =
          gamesPlayed > 0 ? actualPoints / gamesPlayed : getPositionBaseline(activePlayer.position);

        // Calculate prop-based projection
        let propProjectedPoints = 0;
        let propCount = 0;

        if (activePlayer.props.length > 0) {
          const propData = aggregatePlayerProps(
            activePlayer.props.map((p) => ({
              propType: p.propType as import("@prisma/client").PropType,
              line: p.line,
            })),
            activePlayer.position
          );
          propProjectedPoints = propData.points;
          propCount = propData.propCount;
        }

        // Blend projections
        const { blended, confidence, source } = blendProjections(
          propProjectedPoints > 0 ? propProjectedPoints : null,
          historicalPoints,
          propCount,
          gamesPlayed
        );

        const projectedPoints = Math.round(blended * 100) / 100;

        // Calculate expected value
        let expectedValue: number | null = null;
        let winProb: number | null = null;
        const opponent: string | null = teamOdd?.opponent || null;
        let isByeWeek = false;

        if (isEliminated) {
          expectedValue = null;
        } else if (week === 1 && hasBye) {
          isByeWeek = true;
          expectedValue = null;
        } else if (teamOdd) {
          winProb = teamOdd.winProb;
          expectedValue = calculateExpectedValue(projectedPoints, winProb);
        } else if (!hasBye || week > 1) {
          winProb = 0.5;
          expectedValue = calculateExpectedValue(projectedPoints, winProb);
        }

        return {
          id: roster.player.id,
          name: roster.player.name,
          position: roster.player.position,
          team: roster.player.team,
          slot: roster.rosterSlot,
          actualPoints,
          // Enhanced projection data
          historicalPoints: Math.round(historicalPoints * 100) / 100,
          propProjectedPoints:
            propProjectedPoints > 0 ? Math.round(propProjectedPoints * 100) / 100 : null,
          projectedPoints,
          confidence,
          source,
          propCount,
          gamesPlayed,
          // Odds and EV
          teamWinProb: winProb,
          expectedValue,
          opponent,
          isEliminated,
          isByeWeek,
          // Weekly scores
          weeklyScores: roster.player.scores.map((s) => ({
            week: s.week,
            points: s.points,
          })),
          // Prop details for UI
          propBreakdown: activePlayer.props.map((p) => ({
            propType: p.propType,
            line: p.line,
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
      const totalPropBased = players.filter(
        (p) => p.source === "prop" || p.source === "blended"
      ).length;

      return {
        ownerId: owner.id,
        ownerName: owner.name,
        players,
        actualPoints: Math.round(totalActual * 100) / 100,
        projectedPoints: Math.round(totalProjected * 100) / 100,
        expectedValue: Math.round(totalEV * 100) / 100,
        totalExpectedValue: Math.round((totalActual + totalEV) * 100) / 100,
        propBasedCount: totalPropBased,
      };
    });

    // Sort by total expected value
    projections.sort((a, b) => b.totalExpectedValue - a.totalExpectedValue);

    // Summary stats
    const totalPlayersWithProps = projections.reduce((sum, p) => sum + p.propBasedCount, 0);
    const totalPlayers = projections.reduce((sum, p) => sum + p.players.length, 0);

    return NextResponse.json({
      projections,
      week,
      year,
      byeTeams: Array.from(byeTeams),
      eliminatedTeams: Array.from(eliminatedTeams),
      stats: {
        totalPlayers,
        playersWithProps: totalPlayersWithProps,
        propCoverage: Math.round((totalPlayersWithProps / totalPlayers) * 100),
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching enhanced projections:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch enhanced projections",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
