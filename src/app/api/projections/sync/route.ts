import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { calculateProjection, calculateExpectedValue } from "@/lib/projections/calculator";
import { getEliminatedTeams } from "@/lib/espn/client";
import { Position } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/projections/sync
 * Recalculate all projections based on current data
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const week = parseInt(url.searchParams.get("week") || "2"); // Default to divisional round

    console.log(`Syncing projections for week ${week}, year ${year}...`);

    // Get eliminated teams
    const eliminatedTeams = await getEliminatedTeams();

    // Get all players on rosters with their scores
    const players = await prisma.player.findMany({
      where: {
        rosters: {
          some: { year },
        },
      },
      include: {
        scores: {
          where: { year },
          orderBy: { week: "asc" },
        },
        rosters: {
          where: { year },
          select: { ownerId: true },
        },
      },
    });

    // Get team odds for this week
    const teamOdds = await prisma.teamOdds.findMany({
      where: { year, week },
    });
    const oddsMap = new Map(teamOdds.map((o) => [o.team, o.winProb]));

    // Calculate projections for each player
    const results = [];
    const skipped = [];

    for (const player of players) {
      const playerTeam = (player.team || "").toUpperCase();

      // Skip eliminated players
      if (eliminatedTeams.has(playerTeam)) {
        skipped.push({ name: player.name, reason: "eliminated" });
        continue;
      }

      // Calculate projection based on playoff performance
      const projection = calculateProjection({
        id: player.id,
        name: player.name,
        position: player.position as Position,
        team: player.team,
        scores: player.scores.map((s) => ({
          week: s.week,
          points: s.points,
          breakdown: s.breakdown as Record<string, unknown> | undefined,
        })),
      });

      // Get team win probability
      const teamWinProb = oddsMap.get(playerTeam) || null;
      const expectedValue = calculateExpectedValue(projection.projectedPoints, teamWinProb);

      // Store projection
      await prisma.playerProjection.upsert({
        where: {
          playerId_week_year: {
            playerId: player.id,
            week,
            year,
          },
        },
        update: {
          projectedPoints: projection.projectedPoints,
          teamWinProb,
          expectedValue,
          breakdown: projection.breakdown
            ? JSON.parse(JSON.stringify(projection.breakdown))
            : undefined,
          source: projection.basis,
        },
        create: {
          playerId: player.id,
          week,
          year,
          projectedPoints: projection.projectedPoints,
          teamWinProb,
          expectedValue,
          breakdown: projection.breakdown
            ? JSON.parse(JSON.stringify(projection.breakdown))
            : undefined,
          source: projection.basis,
        },
      });

      results.push({
        name: player.name,
        team: player.team,
        projectedPoints: projection.projectedPoints,
        teamWinProb,
        expectedValue,
        confidence: projection.confidence,
        basis: projection.basis,
      });
    }

    console.log(`Synced ${results.length} projections, skipped ${skipped.length}`);

    return NextResponse.json({
      message: "Projections synced successfully",
      synced: results.length,
      skipped: skipped.length,
      week,
      year,
      projections: results,
    });
  } catch (error) {
    console.error("Error syncing projections:", error);
    return NextResponse.json(
      {
        error: "Failed to sync projections",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
