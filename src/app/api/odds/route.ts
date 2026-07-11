import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR, BYE_TEAMS_2025 } from "@/lib/constants";
import { fetchNFLOdds } from "@/lib/odds/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/odds
 * Get current team odds from the database
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const week = url.searchParams.get("week") ? parseInt(url.searchParams.get("week")!) : undefined;

    const where: { year: number; week?: number } = { year };
    if (week) {
      where.week = week;
    }

    let odds = await prisma.teamOdds.findMany({
      where,
      orderBy: [{ week: "asc" }, { team: "asc" }],
    });

    // Filter out bye teams for Wild Card (bye teams don't play Wild Card)
    // Also filter out games where the opponent is a bye team
    const byeTeams = new Set(BYE_TEAMS_2025);
    if (week === 1) {
      odds = odds.filter((o) => !byeTeams.has(o.team) && !byeTeams.has(o.opponent));
    }

    return NextResponse.json({
      odds,
      byeTeams: week === 1 ? Array.from(byeTeams) : [],
      lastUpdated: odds.length > 0 ? odds[0].updatedAt : null,
    });
  } catch (error) {
    console.error("Error fetching odds:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch odds",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/odds
 * Sync odds from The Odds API
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const week = parseInt(url.searchParams.get("week") || "2"); // Default to divisional round

    // Fetch fresh odds from the API
    const liveOdds = await fetchNFLOdds();

    if (liveOdds.length === 0) {
      return NextResponse.json({
        message: "No odds available (API key may not be set)",
        synced: 0,
      });
    }

    // Store odds for each team
    const results = [];
    for (const game of liveOdds) {
      // Home team
      const homeResult = await prisma.teamOdds.upsert({
        where: {
          team_week_year: {
            team: game.homeTeam,
            week,
            year,
          },
        },
        update: {
          opponent: game.awayTeam,
          winProb: game.homeWinProb,
          moneyline: game.homeMoneyline,
          gameTime: game.commenceTime,
          source: "the-odds-api",
        },
        create: {
          team: game.homeTeam,
          week,
          year,
          opponent: game.awayTeam,
          winProb: game.homeWinProb,
          moneyline: game.homeMoneyline,
          gameTime: game.commenceTime,
          source: "the-odds-api",
        },
      });
      results.push(homeResult);

      // Away team
      const awayResult = await prisma.teamOdds.upsert({
        where: {
          team_week_year: {
            team: game.awayTeam,
            week,
            year,
          },
        },
        update: {
          opponent: game.homeTeam,
          winProb: game.awayWinProb,
          moneyline: game.awayMoneyline,
          gameTime: game.commenceTime,
          source: "the-odds-api",
        },
        create: {
          team: game.awayTeam,
          week,
          year,
          opponent: game.homeTeam,
          winProb: game.awayWinProb,
          moneyline: game.awayMoneyline,
          gameTime: game.commenceTime,
          source: "the-odds-api",
        },
      });
      results.push(awayResult);
    }

    return NextResponse.json({
      message: "Odds synced successfully",
      synced: results.length,
      games: liveOdds.length,
    });
  } catch (error) {
    console.error("Error syncing odds:", error);
    return NextResponse.json(
      {
        error: "Failed to sync odds",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
