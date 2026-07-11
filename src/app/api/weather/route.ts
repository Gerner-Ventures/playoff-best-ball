import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { fetchStadiumWeather, getWeatherIcon, getWeatherImpact } from "@/lib/weather/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/weather
 * Get weather data for games from database or fetch fresh
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const week = url.searchParams.get("week") ? parseInt(url.searchParams.get("week")!) : undefined;
    const eventId = url.searchParams.get("eventId") || undefined;

    const where: { year: number; week?: number; eventId?: string } = { year };
    if (week) where.week = week;
    if (eventId) where.eventId = eventId;

    const weather = await prisma.gameWeather.findMany({
      where,
      orderBy: [{ week: "asc" }],
    });

    // Add computed fields
    const enrichedWeather = weather.map((w) => ({
      ...w,
      icon: getWeatherIcon({
        temperature: w.temperature ?? 72,
        windSpeed: w.windSpeed ?? 0,
        windDirection: w.windDirection ?? "N/A",
        precipitation: w.precipitation ?? 0,
        condition: w.condition ?? "Clear",
        isDome: w.isDome,
      }),
      impact: getWeatherImpact({
        temperature: w.temperature ?? 72,
        windSpeed: w.windSpeed ?? 0,
        windDirection: w.windDirection ?? "N/A",
        precipitation: w.precipitation ?? 0,
        condition: w.condition ?? "Clear",
        isDome: w.isDome,
      }),
    }));

    return NextResponse.json({
      weather: enrichedWeather,
      count: weather.length,
      lastUpdated: weather.length > 0 ? weather[0].fetchedAt : null,
    });
  } catch (error) {
    console.error("Error fetching weather:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch weather",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/weather
 * Sync weather data for upcoming games
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const week = parseInt(url.searchParams.get("week") || "2");

    // Get team odds to find upcoming games (has game times)
    const teamOdds = await prisma.teamOdds.findMany({
      where: { year, week },
      distinct: ["team"],
    });

    if (teamOdds.length === 0) {
      return NextResponse.json({
        message: "No games found for this week",
        synced: 0,
      });
    }

    const results = [];

    // Process each unique game (team odds has both home and away, we need unique games)
    const processedGames = new Set<string>();

    for (const odds of teamOdds) {
      // Create a unique game key to avoid processing same game twice
      const teams = [odds.team, odds.opponent].sort();
      const gameKey = teams.join("-");

      if (processedGames.has(gameKey)) continue;
      processedGames.add(gameKey);

      // Determine home team (the one that appears first in the odds table with this game)
      const homeTeamOdds = teamOdds.find(
        (o) => (o.team === odds.team || o.team === odds.opponent) && o.gameTime
      );

      if (!homeTeamOdds?.gameTime) {
        console.warn(`No game time found for ${gameKey}`);
        continue;
      }

      // Fetch weather for the home team's stadium
      const homeTeam = odds.team; // Assume the team in odds is home for simplicity
      const weatherData = await fetchStadiumWeather(homeTeam, homeTeamOdds.gameTime);

      if (!weatherData) {
        console.warn(`Could not fetch weather for ${homeTeam}`);
        continue;
      }

      // Create a pseudo event ID from the teams and week
      const eventId = `${year}-W${week}-${gameKey}`;

      try {
        const result = await prisma.gameWeather.upsert({
          where: { eventId },
          update: {
            week,
            year,
            temperature: weatherData.temperature,
            windSpeed: weatherData.windSpeed,
            windDirection: weatherData.windDirection,
            precipitation: weatherData.precipitation,
            condition: weatherData.condition,
            isDome: weatherData.isDome,
            fetchedAt: new Date(),
          },
          create: {
            eventId,
            week,
            year,
            temperature: weatherData.temperature,
            windSpeed: weatherData.windSpeed,
            windDirection: weatherData.windDirection,
            precipitation: weatherData.precipitation,
            condition: weatherData.condition,
            isDome: weatherData.isDome,
          },
        });
        results.push(result);
      } catch (upsertError) {
        console.error(`Error upserting weather for ${gameKey}:`, upsertError);
      }
    }

    return NextResponse.json({
      message: "Weather synced successfully",
      synced: results.length,
      games: processedGames.size,
    });
  } catch (error) {
    console.error("Error syncing weather:", error);
    return NextResponse.json(
      {
        error: "Failed to sync weather",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
