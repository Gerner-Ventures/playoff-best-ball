import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { getEliminatedTeams } from "@/lib/espn/client";

// GET /api/admin/players/unmatched - Get players without ESPN IDs
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const rosteredOnly = searchParams.get("rostered") === "true";

    const whereClause: Record<string, unknown> = {
      espnId: null,
    };

    if (rosteredOnly) {
      whereClause.rosters = { some: { year } };
    }

    const players = await prisma.player.findMany({
      where: whereClause,
      include: {
        rosters: {
          where: { year },
          include: { owner: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const eliminatedTeams = await getEliminatedTeams();

    // Categorize players
    const unmatchedPlayers = players.map((player) => {
      const isRostered = player.rosters.length > 0;
      const isEliminated = player.team ? eliminatedTeams.has(player.team.toUpperCase()) : false;
      const owner = player.rosters[0]?.owner;

      return {
        id: player.id,
        name: player.name,
        position: player.position,
        team: player.team,
        isRostered,
        isEliminated,
        ownerName: owner?.name || null,
        // Priority: rostered on active team > rostered on eliminated > not rostered
        priority: isRostered && !isEliminated ? 1 : isRostered ? 2 : 3,
      };
    });

    // Sort by priority then name
    unmatchedPlayers.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.name.localeCompare(b.name);
    });

    const onActiveTeams = unmatchedPlayers.filter((p) => p.isRostered && !p.isEliminated).length;
    const onEliminatedTeams = unmatchedPlayers.filter((p) => p.isRostered && p.isEliminated).length;

    return NextResponse.json({
      players: unmatchedPlayers,
      total: unmatchedPlayers.length,
      summary: {
        onActiveTeams,
        onEliminatedTeams,
        notRostered: unmatchedPlayers.length - onActiveTeams - onEliminatedTeams,
      },
    });
  } catch (error) {
    console.error("Error fetching unmatched players:", error);
    return NextResponse.json({ error: "Failed to fetch unmatched players" }, { status: 500 });
  }
}
