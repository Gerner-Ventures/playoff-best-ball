import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

// Known team mappings for players without team data
// These are players who haven't played in playoff games yet
const PLAYER_TEAM_MAPPINGS: Record<string, string> = {
  // Bye team players (DEN, SEA)
  "Bo Nix": "DEN",
  "Courtland Sutton": "DEN",
  "Denver Broncos": "DEN",
  "Kenneth Walker": "SEA",
  "DK Metcalf": "SEA",
  "Jaxon Smith-Njigba": "SEA",
  "Zach Charbonnet": "SEA",

  // Other players without teams
  "Dalton Schultz": "HOU",
  "RJ Harvey": "BUF",
  "Jayden Higgins": "CIN",
  "Jaylen Warren": "PIT",
  "Troy Franklin": "DEN",
  "Jason Meyers": "SEA",
  "Woody Marks": "SF",
  "AJ Brown": "PHI",
  "Pat Bryant": "CHI",
  "Ka'imi Fairbairn": "HOU",
  "Nico Collins": "HOU",
  "Sam Darnold": "MIN",
  "Will Lutz": "DEN",
  "Kenny Gainwell": "PHI",
  "AJ Barner": "SEA",
};

/**
 * POST /api/players/update-teams
 * Update team associations for players missing team data
 */
export async function POST() {
  try {
    const results = {
      updated: 0,
      notFound: [] as string[],
      alreadySet: [] as string[],
    };

    for (const [playerName, team] of Object.entries(PLAYER_TEAM_MAPPINGS)) {
      // Find player by name
      const player = await prisma.player.findFirst({
        where: { name: playerName },
      });

      if (!player) {
        results.notFound.push(playerName);
        continue;
      }

      if (player.team) {
        results.alreadySet.push(`${playerName} (${player.team})`);
        continue;
      }

      // Update team
      await prisma.player.update({
        where: { id: player.id },
        data: { team },
      });

      results.updated++;
    }

    return NextResponse.json({
      message: "Team update complete",
      ...results,
    });
  } catch (error) {
    console.error("Error updating player teams:", error);
    return NextResponse.json(
      {
        error: "Failed to update player teams",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/players/update-teams
 * Get list of players without team data
 */
export async function GET() {
  try {
    const playersWithoutTeam = await prisma.player.findMany({
      where: { team: null },
      select: { id: true, name: true, position: true },
    });

    return NextResponse.json({
      count: playersWithoutTeam.length,
      players: playersWithoutTeam,
    });
  } catch (error) {
    console.error("Error fetching players without team:", error);
    return NextResponse.json({ error: "Failed to fetch players" }, { status: 500 });
  }
}
