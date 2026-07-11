import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/admin/players/[id] - Get single player details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        rosters: {
          include: { owner: true },
        },
        scores: {
          orderBy: { week: "asc" },
        },
      },
    });

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    return NextResponse.json({ player });
  } catch (error) {
    console.error("Error fetching player:", error);
    return NextResponse.json({ error: "Failed to fetch player" }, { status: 500 });
  }
}

// PATCH /api/admin/players/[id] - Update player
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, team, espnId } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (team !== undefined) updateData.team = team || null;
    if (espnId !== undefined) updateData.espnId = espnId || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Check if ESPN ID is already used by another player
    if (espnId) {
      const existingPlayer = await prisma.player.findUnique({
        where: { espnId },
      });

      if (existingPlayer && existingPlayer.id !== id) {
        return NextResponse.json(
          {
            error: "ESPN ID already in use",
            message: `ESPN ID "${espnId}" is already assigned to player "${existingPlayer.name}" (${existingPlayer.id})`,
            conflictingPlayer: {
              id: existingPlayer.id,
              name: existingPlayer.name,
              team: existingPlayer.team,
            },
          },
          { status: 409 }
        );
      }
    }

    const player = await prisma.player.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      player,
    });
  } catch (error) {
    console.error("Error updating player:", error);

    // Handle unique constraint error more gracefully
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "ESPN ID is already in use by another player" },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Failed to update player" }, { status: 500 });
  }
}

// POST /api/admin/players/[id]/score - Add manual score entry
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { week, points, breakdown, year = CURRENT_SEASON_YEAR } = body;

    if (week === undefined || points === undefined) {
      return NextResponse.json({ error: "Missing required fields: week, points" }, { status: 400 });
    }

    // Upsert the score
    const score = await prisma.playerScore.upsert({
      where: {
        playerId_week_year: {
          playerId: id,
          week,
          year,
        },
      },
      update: {
        points,
        breakdown: breakdown || null,
      },
      create: {
        playerId: id,
        week,
        year,
        points,
        breakdown: breakdown || null,
      },
    });

    return NextResponse.json({
      success: true,
      score,
    });
  } catch (error) {
    console.error("Error adding score:", error);
    return NextResponse.json({ error: "Failed to add score" }, { status: 500 });
  }
}

// DELETE /api/admin/players/[id] - Delete player
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Check if player is rostered
    const rosters = await prisma.roster.findMany({
      where: { playerId: id },
    });

    if (rosters.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete player that is on a roster" },
        { status: 400 }
      );
    }

    await prisma.player.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting player:", error);
    return NextResponse.json({ error: "Failed to delete player" }, { status: 500 });
  }
}
