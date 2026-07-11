import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { getEliminatedTeams } from "@/lib/espn/client";

export async function GET() {
  try {
    const year = CURRENT_SEASON_YEAR;
    const playoffWeeks = [1, 2, 3, 5];

    // Get counts and stats in parallel
    const [
      totalPlayers,
      playersWithEspnId,
      totalOwners,
      totalRosters,
      scoresByWeek,
      lastScore,
      eliminatedTeams,
      allPlayers,
    ] = await Promise.all([
      prisma.player.count(),
      prisma.player.count({ where: { espnId: { not: null } } }),
      prisma.owner.count(),
      prisma.roster.count({ where: { year } }),
      // Get score counts per week
      prisma.playerScore.groupBy({
        by: ["week"],
        where: { year },
        _count: { id: true },
      }),
      // Get most recent score update
      prisma.playerScore.findFirst({
        where: { year },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      // Get eliminated teams
      getEliminatedTeams(),
      // Get all rostered players to check for unmatched on active teams
      prisma.player.findMany({
        where: {
          rosters: { some: { year } },
        },
        select: {
          id: true,
          name: true,
          team: true,
          espnId: true,
          position: true,
        },
      }),
    ]);

    // Calculate week coverage
    const weekCoverage = playoffWeeks.map((week) => {
      const weekData = scoresByWeek.find((s) => s.week === week);
      const scoresCount = weekData?._count.id || 0;
      // Rough estimate: should have scores for all rostered players whose teams played
      return {
        week,
        label: getWeekLabel(week),
        scoresCount,
        // We'll mark as "has data" if there are any scores
        hasData: scoresCount > 0,
      };
    });

    // Find unmatched players (no ESPN ID) on active teams
    const eliminatedSet = eliminatedTeams;
    const unmatchedPlayers = allPlayers.filter(
      (p) => !p.espnId && p.team && !eliminatedSet.has(p.team.toUpperCase())
    );
    const unmatchedOnActiveTeams = unmatchedPlayers.length;

    // Calculate players on eliminated vs active teams
    const playersOnActiveTeams = allPlayers.filter(
      (p) => p.team && !eliminatedSet.has(p.team.toUpperCase())
    ).length;
    const playersOnEliminatedTeams = allPlayers.filter(
      (p) => p.team && eliminatedSet.has(p.team.toUpperCase())
    ).length;

    // Determine health status
    const lastSyncAge = lastScore?.updatedAt
      ? Date.now() - new Date(lastScore.updatedAt).getTime()
      : null;
    const isStale = lastSyncAge ? lastSyncAge > 60 * 60 * 1000 : true; // Stale if > 1 hour
    const hasUnmatchedIssues = unmatchedOnActiveTeams > 0;

    let healthStatus: "healthy" | "warning" | "error" = "healthy";
    if (hasUnmatchedIssues) healthStatus = "warning";
    if (isStale && playersOnActiveTeams > 0) healthStatus = "warning";

    return NextResponse.json({
      status: healthStatus,
      lastSync: lastScore?.updatedAt || null,
      lastSyncAge: lastSyncAge ? Math.floor(lastSyncAge / 1000 / 60) : null, // minutes
      weekCoverage,
      stats: {
        totalPlayers,
        playersWithEspnId,
        playersWithoutEspnId: totalPlayers - playersWithEspnId,
        totalOwners,
        totalRosters,
        eliminatedTeams: eliminatedSet.size,
        activeTeams: 14 - eliminatedSet.size, // 14 playoff teams
        playersOnActiveTeams,
        playersOnEliminatedTeams,
        unmatchedOnActiveTeams,
      },
      eliminatedTeamsList: Array.from(eliminatedSet).sort(),
      alerts: buildAlerts({
        isStale,
        unmatchedOnActiveTeams,
        lastSyncAge,
        playersWithoutEspnId: totalPlayers - playersWithEspnId,
      }),
    });
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json({ error: "Failed to fetch health data" }, { status: 500 });
  }
}

function getWeekLabel(week: number): string {
  const labels: Record<number, string> = {
    1: "Wild Card",
    2: "Divisional",
    3: "Conference",
    5: "Super Bowl",
  };
  return labels[week] || `Week ${week}`;
}

function buildAlerts(params: {
  isStale: boolean;
  unmatchedOnActiveTeams: number;
  lastSyncAge: number | null;
  playersWithoutEspnId: number;
}): { type: "warning" | "error" | "info"; message: string }[] {
  const alerts: { type: "warning" | "error" | "info"; message: string }[] = [];

  if (params.isStale && params.lastSyncAge) {
    const hours = Math.floor(params.lastSyncAge / 60);
    alerts.push({
      type: "warning",
      message: `Data is ${hours > 0 ? `${hours}h ` : ""}${params.lastSyncAge % 60}m old`,
    });
  }

  if (params.unmatchedOnActiveTeams > 0) {
    alerts.push({
      type: "warning",
      message: `${params.unmatchedOnActiveTeams} player${params.unmatchedOnActiveTeams > 1 ? "s" : ""} on active teams missing ESPN ID`,
    });
  }

  if (params.playersWithoutEspnId > 0) {
    alerts.push({
      type: "info",
      message: `${params.playersWithoutEspnId} total player${params.playersWithoutEspnId > 1 ? "s" : ""} without ESPN ID`,
    });
  }

  return alerts;
}
