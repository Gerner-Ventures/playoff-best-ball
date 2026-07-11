import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { fetchAllNFLPlayerProps, matchPlayerName } from "@/lib/props/client";
import { PropType } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/props
 * Get stored player props from the database
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const week = url.searchParams.get("week") ? parseInt(url.searchParams.get("week")!) : undefined;
    const playerId = url.searchParams.get("playerId") || undefined;
    const propType = url.searchParams.get("propType") as PropType | undefined;

    const where: {
      year: number;
      week?: number;
      playerId?: string;
      propType?: PropType;
    } = { year };

    if (week) where.week = week;
    if (playerId) where.playerId = playerId;
    if (propType) where.propType = propType;

    const props = await prisma.playerProp.findMany({
      where,
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            team: true,
          },
        },
      },
      orderBy: [{ week: "asc" }, { propType: "asc" }],
    });

    return NextResponse.json({
      props,
      count: props.length,
      lastUpdated: props.length > 0 ? props[0].updatedAt : null,
    });
  } catch (error) {
    console.error("Error fetching props:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch props",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/props
 * Sync player props from The Odds API
 * This is expensive in terms of API calls, so use sparingly!
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const week = parseInt(url.searchParams.get("week") || "2"); // Default to divisional round
    const rosteredOnly = url.searchParams.get("rosteredOnly") === "true";

    // Get all rostered players to match props against
    const rosteredPlayers = await prisma.roster.findMany({
      where: { year },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            team: true,
            position: true,
          },
        },
      },
    });

    const dbPlayers = rosteredPlayers.map((r) => r.player);
    const dbPlayerSet = new Set(dbPlayers.map((p) => p.id));

    console.log(`Found ${dbPlayers.length} rostered players to match props against`);

    // Fetch props from The Odds API
    const allProps = await fetchAllNFLPlayerProps();

    if (allProps.length === 0) {
      return NextResponse.json({
        message: "No props available (API key may not be set or no upcoming games)",
        synced: 0,
      });
    }

    console.log(`Fetched ${allProps.length} props from The Odds API`);

    // Match props to database players and store
    let matchedCount = 0;
    let unmatchedCount = 0;
    const results = [];

    for (const prop of allProps) {
      // Try to match the prop player to a database player
      const matchedPlayer = matchPlayerName(prop.playerName, dbPlayers);

      if (!matchedPlayer) {
        unmatchedCount++;
        continue;
      }

      // If rostered only, skip players not on any roster
      if (rosteredOnly && !dbPlayerSet.has(matchedPlayer.id)) {
        continue;
      }

      matchedCount++;

      // Upsert the prop
      try {
        const result = await prisma.playerProp.upsert({
          where: {
            playerId_week_year_propType_bookmaker: {
              playerId: matchedPlayer.id,
              week,
              year,
              propType: prop.propType,
              bookmaker: prop.bookmaker,
            },
          },
          update: {
            line: prop.line,
            overOdds: prop.overOdds,
            underOdds: prop.underOdds,
            impliedOver: prop.impliedOver,
            eventId: prop.eventId,
          },
          create: {
            playerId: matchedPlayer.id,
            week,
            year,
            propType: prop.propType,
            line: prop.line,
            overOdds: prop.overOdds,
            underOdds: prop.underOdds,
            impliedOver: prop.impliedOver,
            bookmaker: prop.bookmaker,
            eventId: prop.eventId,
          },
        });
        results.push(result);
      } catch (upsertError) {
        console.error(`Error upserting prop for ${matchedPlayer.name}:`, upsertError);
      }
    }

    return NextResponse.json({
      message: "Props synced successfully",
      synced: results.length,
      matched: matchedCount,
      unmatched: unmatchedCount,
      totalFetched: allProps.length,
    });
  } catch (error) {
    console.error("Error syncing props:", error);
    return NextResponse.json(
      {
        error: "Failed to sync props",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
