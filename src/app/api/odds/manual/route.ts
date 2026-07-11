import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/odds/manual
 * Manually add or update team odds
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { team, opponent, winProb, week, year } = body;

    if (!team || !opponent || winProb === undefined || !week || !year) {
      return NextResponse.json(
        { error: "Missing required fields: team, opponent, winProb, week, year" },
        { status: 400 }
      );
    }

    const result = await prisma.teamOdds.upsert({
      where: {
        team_week_year: {
          team,
          week,
          year,
        },
      },
      update: {
        opponent,
        winProb,
        source: "manual",
      },
      create: {
        team,
        week,
        year,
        opponent,
        winProb,
        source: "manual",
      },
    });

    return NextResponse.json({
      message: "Odds updated successfully",
      odds: result,
    });
  } catch (error) {
    console.error("Error updating odds:", error);
    return NextResponse.json(
      {
        error: "Failed to update odds",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
