import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { getEliminatedTeams } from "@/lib/espn/client";

// Determine current week based on eliminated teams count
function getCurrentWeek(eliminatedCount: number): number {
  if (eliminatedCount < 6) {
    return 1; // Wild Card
  } else if (eliminatedCount < 10) {
    return 2; // Divisional
  } else if (eliminatedCount < 12) {
    return 3; // Conference Championship
  } else {
    return 5; // Super Bowl
  }
}

// GET /api/admin/rosters - Get all rosters with players
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || String(CURRENT_SEASON_YEAR));

    const [owners, eliminatedTeams] = await Promise.all([
      prisma.owner.findMany({
        include: {
          rosters: {
            where: { year },
            include: {
              player: {
                include: {
                  scores: {
                    where: { year },
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
                      },
                    },
                  },
                },
              },
            },
            orderBy: { rosterSlot: "asc" },
          },
        },
        orderBy: { name: "asc" },
      }),
      getEliminatedTeams(),
    ]);

    // Determine current week based on eliminated teams
    const currentWeek = getCurrentWeek(eliminatedTeams.size);

    // Transform data for the frontend
    const rostersData = owners.map((owner) => {
      const players = owner.rosters.map((roster) => {
        const substitution = roster.substitutions[0]; // Max one per roster per year
        const hasSubstitutionRecord = !!substitution;
        // Only show as "injured/active substitution" if we're at or past the effective week
        const isSubstitutionActive =
          hasSubstitutionRecord && currentWeek >= substitution.effectiveWeek;

        // Calculate points with substitution logic
        let totalPoints: number;
        let pointsBreakdown: { originalPoints: number; substitutePoints: number } | undefined;

        if (hasSubstitutionRecord) {
          // Original player's points before effective week
          const originalPointsBefore = roster.player.scores
            .filter((s) => s.week < substitution.effectiveWeek)
            .reduce((sum, s) => sum + s.points, 0);

          // Substitute's points from effective week onwards
          const substitutePointsAfter = substitution.substitutePlayer.scores
            .filter((s) => s.week >= substitution.effectiveWeek)
            .reduce((sum, s) => sum + s.points, 0);

          totalPoints = originalPointsBefore + substitutePointsAfter;
          pointsBreakdown = {
            originalPoints: originalPointsBefore,
            substitutePoints: substitutePointsAfter,
          };
        } else {
          totalPoints = roster.player.scores.reduce((sum, s) => sum + s.points, 0);
        }

        // Use substitute's team for elimination check if substitution is active
        const activeTeam =
          isSubstitutionActive && substitution
            ? substitution.substitutePlayer.team
            : roster.player.team;

        const isEliminated = activeTeam ? eliminatedTeams.has(activeTeam.toUpperCase()) : false;

        return {
          rosterId: roster.id,
          playerId: roster.player.id,
          name: roster.player.name,
          position: roster.player.position,
          team: roster.player.team,
          espnId: roster.player.espnId,
          rosterSlot: roster.rosterSlot,
          totalPoints,
          isEliminated,
          hasEspnId: !!roster.player.espnId,
          // Substitution data - hasSubstitution is true only when active
          hasSubstitution: isSubstitutionActive,
          substitution: hasSubstitutionRecord
            ? {
                id: substitution.id,
                effectiveWeek: substitution.effectiveWeek,
                reason: substitution.reason,
                isActive: isSubstitutionActive,
                substitutePlayer: {
                  id: substitution.substitutePlayer.id,
                  name: substitution.substitutePlayer.name,
                  position: substitution.substitutePlayer.position,
                  team: substitution.substitutePlayer.team,
                  espnId: substitution.substitutePlayer.espnId,
                },
                pointsBreakdown,
              }
            : null,
        };
      });

      const totalPoints = players.reduce((sum, p) => sum + p.totalPoints, 0);
      const activePlayers = players.filter((p) => !p.isEliminated && !p.hasSubstitution).length;

      return {
        ownerId: owner.id,
        ownerName: owner.name,
        players,
        totalPoints,
        activePlayers,
        totalPlayers: players.length,
      };
    });

    return NextResponse.json({
      rosters: rostersData,
      year,
      currentWeek,
      eliminatedTeams: Array.from(eliminatedTeams),
    });
  } catch (error) {
    console.error("Error fetching rosters:", error);
    return NextResponse.json({ error: "Failed to fetch rosters" }, { status: 500 });
  }
}

// POST /api/admin/rosters - Add player to roster
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      ownerId,
      playerId,
      playerName,
      position,
      team,
      rosterSlot,
      year = CURRENT_SEASON_YEAR,
    } = body;

    if (!ownerId || !rosterSlot) {
      return NextResponse.json(
        { error: "Missing required fields: ownerId, rosterSlot" },
        { status: 400 }
      );
    }

    // If playerId is provided, use existing player
    // Otherwise, create a new player
    let player;
    if (playerId) {
      player = await prisma.player.findUnique({ where: { id: playerId } });
      if (!player) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }
    } else if (playerName && position) {
      // Check if player already exists
      player = await prisma.player.findFirst({
        where: { name: playerName, position },
      });

      if (!player) {
        // Create new player
        player = await prisma.player.create({
          data: {
            name: playerName,
            position,
            team: team || null,
          },
        });
      }
    } else {
      return NextResponse.json(
        { error: "Must provide playerId or playerName+position" },
        { status: 400 }
      );
    }

    // Check if roster slot is already taken
    const existingRoster = await prisma.roster.findFirst({
      where: {
        ownerId,
        rosterSlot,
        year,
      },
    });

    if (existingRoster) {
      return NextResponse.json(
        { error: `Roster slot ${rosterSlot} is already filled` },
        { status: 400 }
      );
    }

    // Create roster entry
    const roster = await prisma.roster.create({
      data: {
        ownerId,
        playerId: player.id,
        rosterSlot,
        year,
      },
      include: {
        player: true,
        owner: true,
      },
    });

    return NextResponse.json({
      success: true,
      roster: {
        rosterId: roster.id,
        playerId: roster.player.id,
        name: roster.player.name,
        position: roster.player.position,
        team: roster.player.team,
        rosterSlot: roster.rosterSlot,
        ownerName: roster.owner.name,
      },
    });
  } catch (error) {
    console.error("Error adding player to roster:", error);
    return NextResponse.json({ error: "Failed to add player to roster" }, { status: 500 });
  }
}

// DELETE /api/admin/rosters - Remove player from roster
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { rosterId } = body;

    if (!rosterId) {
      return NextResponse.json({ error: "Missing rosterId" }, { status: 400 });
    }

    const roster = await prisma.roster.delete({
      where: { id: rosterId },
      include: { player: true, owner: true },
    });

    return NextResponse.json({
      success: true,
      removed: {
        rosterId: roster.id,
        playerName: roster.player.name,
        ownerName: roster.owner.name,
        rosterSlot: roster.rosterSlot,
      },
    });
  } catch (error) {
    console.error("Error removing player from roster:", error);
    return NextResponse.json({ error: "Failed to remove player from roster" }, { status: 500 });
  }
}
