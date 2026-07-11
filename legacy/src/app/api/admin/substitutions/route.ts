import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";

// GET /api/admin/substitutions - Get all substitutions
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || String(CURRENT_SEASON_YEAR));

    const substitutions = await prisma.substitution.findMany({
      where: { year },
      include: {
        roster: {
          include: {
            owner: true,
          },
        },
        originalPlayer: {
          include: {
            scores: {
              where: { year },
            },
          },
        },
        substitutePlayer: {
          include: {
            scores: {
              where: { year },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform for frontend
    const formattedSubs = substitutions.map((sub) => {
      // Calculate points before and after effective week
      const originalPointsBefore = sub.originalPlayer.scores
        .filter((s) => s.week < sub.effectiveWeek)
        .reduce((sum, s) => sum + s.points, 0);

      const substitutePointsAfter = sub.substitutePlayer.scores
        .filter((s) => s.week >= sub.effectiveWeek)
        .reduce((sum, s) => sum + s.points, 0);

      const combinedPoints = originalPointsBefore + substitutePointsAfter;

      return {
        id: sub.id,
        rosterId: sub.rosterId,
        ownerName: sub.roster.owner.name,
        rosterSlot: sub.roster.rosterSlot,
        effectiveWeek: sub.effectiveWeek,
        reason: sub.reason,
        originalPlayer: {
          id: sub.originalPlayer.id,
          name: sub.originalPlayer.name,
          position: sub.originalPlayer.position,
          team: sub.originalPlayer.team,
          pointsBefore: originalPointsBefore,
        },
        substitutePlayer: {
          id: sub.substitutePlayer.id,
          name: sub.substitutePlayer.name,
          position: sub.substitutePlayer.position,
          team: sub.substitutePlayer.team,
          pointsAfter: substitutePointsAfter,
        },
        combinedPoints,
        createdAt: sub.createdAt,
      };
    });

    return NextResponse.json({
      substitutions: formattedSubs,
      year,
    });
  } catch (error) {
    console.error("Error fetching substitutions:", error);
    return NextResponse.json({ error: "Failed to fetch substitutions" }, { status: 500 });
  }
}

// POST /api/admin/substitutions - Create a new substitution
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      rosterId,
      substitutePlayerId,
      substitutePlayerName,
      substitutePosition,
      substituteTeam,
      effectiveWeek,
      reason,
      year = CURRENT_SEASON_YEAR,
    } = body;

    if (!rosterId || !effectiveWeek) {
      return NextResponse.json(
        { error: "Missing required fields: rosterId, effectiveWeek" },
        { status: 400 }
      );
    }

    // Get the roster to find the original player
    const roster = await prisma.roster.findUnique({
      where: { id: rosterId },
      include: {
        player: true,
        owner: true,
        substitutions: {
          where: { year },
        },
      },
    });

    if (!roster) {
      return NextResponse.json({ error: "Roster not found" }, { status: 404 });
    }

    // Check if there's already a substitution for this roster slot this year
    if (roster.substitutions.length > 0) {
      return NextResponse.json(
        {
          error:
            "A substitution already exists for this roster slot. Delete it first to create a new one.",
        },
        { status: 400 }
      );
    }

    // Get or create the substitute player
    let substitutePlayer;
    if (substitutePlayerId) {
      substitutePlayer = await prisma.player.findUnique({
        where: { id: substitutePlayerId },
      });
      if (!substitutePlayer) {
        return NextResponse.json({ error: "Substitute player not found" }, { status: 404 });
      }
    } else if (substitutePlayerName && substitutePosition) {
      // Check if player exists
      substitutePlayer = await prisma.player.findFirst({
        where: { name: substitutePlayerName, position: substitutePosition },
      });

      if (!substitutePlayer) {
        // Create new player
        substitutePlayer = await prisma.player.create({
          data: {
            name: substitutePlayerName,
            position: substitutePosition,
            team: substituteTeam || null,
          },
        });
      }
    } else {
      return NextResponse.json(
        { error: "Must provide substitutePlayerId or substitutePlayerName+substitutePosition" },
        { status: 400 }
      );
    }

    // Validate that substitute is same position as original (or compatible for FLEX)
    const originalPosition = roster.player.position;
    const subPosition = substitutePlayer.position;
    const flexPositions = ["RB", "WR", "TE"];

    const isCompatible =
      originalPosition === subPosition ||
      (roster.rosterSlot === "FLEX" && flexPositions.includes(subPosition));

    if (!isCompatible) {
      return NextResponse.json(
        {
          error: `Position mismatch: cannot substitute ${subPosition} for ${originalPosition} in ${roster.rosterSlot} slot`,
        },
        { status: 400 }
      );
    }

    // Create the substitution
    const substitution = await prisma.substitution.create({
      data: {
        rosterId,
        originalPlayerId: roster.player.id,
        substitutePlayerId: substitutePlayer.id,
        effectiveWeek,
        year,
        reason: reason || null,
      },
      include: {
        originalPlayer: true,
        substitutePlayer: true,
        roster: {
          include: { owner: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      substitution: {
        id: substitution.id,
        ownerName: substitution.roster.owner.name,
        rosterSlot: substitution.roster.rosterSlot,
        effectiveWeek: substitution.effectiveWeek,
        reason: substitution.reason,
        originalPlayer: {
          id: substitution.originalPlayer.id,
          name: substitution.originalPlayer.name,
          position: substitution.originalPlayer.position,
        },
        substitutePlayer: {
          id: substitution.substitutePlayer.id,
          name: substitution.substitutePlayer.name,
          position: substitution.substitutePlayer.position,
        },
      },
    });
  } catch (error) {
    console.error("Error creating substitution:", error);
    return NextResponse.json({ error: "Failed to create substitution" }, { status: 500 });
  }
}

// DELETE /api/admin/substitutions - Delete a substitution
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { substitutionId } = body;

    if (!substitutionId) {
      return NextResponse.json({ error: "Missing substitutionId" }, { status: 400 });
    }

    const substitution = await prisma.substitution.delete({
      where: { id: substitutionId },
      include: {
        originalPlayer: true,
        substitutePlayer: true,
        roster: {
          include: { owner: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      deleted: {
        id: substitution.id,
        ownerName: substitution.roster.owner.name,
        originalPlayer: substitution.originalPlayer.name,
        substitutePlayer: substitution.substitutePlayer.name,
      },
    });
  } catch (error) {
    console.error("Error deleting substitution:", error);
    return NextResponse.json({ error: "Failed to delete substitution" }, { status: 500 });
  }
}
