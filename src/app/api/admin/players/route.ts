import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { getEliminatedTeams } from "@/lib/espn/client";

// GET /api/admin/players - Search and list players
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const filter = searchParams.get("filter") || "all"; // all, unmatched, rostered
    const year = parseInt(searchParams.get("year") || String(CURRENT_SEASON_YEAR));

    const whereClause: Record<string, unknown> = {};

    // Apply search filter
    if (search) {
      whereClause.name = { contains: search, mode: "insensitive" };
    }

    // Apply category filter
    if (filter === "unmatched") {
      whereClause.espnId = null;
    } else if (filter === "rostered") {
      whereClause.rosters = { some: { year } };
    }

    const players = await prisma.player.findMany({
      where: whereClause,
      include: {
        rosters: {
          where: { year },
          include: { owner: true },
        },
        scores: {
          where: { year },
        },
      },
      orderBy: { name: "asc" },
      take: 100, // Limit results
    });

    const eliminatedTeams = await getEliminatedTeams();

    const playersData = players.map((player) => {
      const totalPoints = player.scores.reduce((sum, s) => sum + s.points, 0);
      const owner = player.rosters[0]?.owner;
      const isEliminated = player.team ? eliminatedTeams.has(player.team.toUpperCase()) : false;

      return {
        id: player.id,
        name: player.name,
        position: player.position,
        team: player.team,
        espnId: player.espnId,
        hasEspnId: !!player.espnId,
        totalPoints,
        isEliminated,
        isRostered: player.rosters.length > 0,
        ownerName: owner?.name || null,
        rosterSlot: player.rosters[0]?.rosterSlot || null,
      };
    });

    return NextResponse.json({
      players: playersData,
      total: playersData.length,
    });
  } catch (error) {
    console.error("Error fetching players:", error);
    return NextResponse.json({ error: "Failed to fetch players" }, { status: 500 });
  }
}

// POST /api/admin/players - Create a new player
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, position, team, espnId } = body;

    if (!name || !position) {
      return NextResponse.json(
        { error: "Missing required fields: name, position" },
        { status: 400 }
      );
    }

    // Check if player already exists
    const existing = await prisma.player.findFirst({
      where: { name, position },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Player already exists", player: existing },
        { status: 409 }
      );
    }

    const player = await prisma.player.create({
      data: {
        name,
        position,
        team: team || null,
        espnId: espnId || null,
      },
    });

    return NextResponse.json({
      success: true,
      player,
    });
  } catch (error) {
    console.error("Error creating player:", error);
    return NextResponse.json({ error: "Failed to create player" }, { status: 500 });
  }
}
