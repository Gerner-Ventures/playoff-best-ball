import { NextResponse } from "next/server";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Determine current playoff week based on date
function getCurrentPlayoffWeek(): number {
  const now = new Date();
  // 2025-26 NFL Playoff dates (approximate - adjust as needed)
  // Wild Card: Jan 11-13, 2026
  // Divisional: Jan 18-19, 2026
  // Conference: Jan 25-26, 2026
  // Super Bowl: Feb 9, 2026
  const wildCardEnd = new Date("2026-01-14");
  const divisionalEnd = new Date("2026-01-20");
  const conferenceEnd = new Date("2026-01-27");

  if (now < wildCardEnd) return 1;
  if (now < divisionalEnd) return 2;
  if (now < conferenceEnd) return 3;
  return 5; // Super Bowl
}

/**
 * GET /api/cron
 * Vercel Cron endpoint to automatically sync scores
 * Configure in vercel.json to run every 15 minutes during games
 *
 * Query params:
 * - type: "scores" (default) | "odds" | "props" | "all"
 */
export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const syncType = url.searchParams.get("type") || "scores";

  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const currentWeek = getCurrentPlayoffWeek();
    const results: Record<string, unknown> = {};

    // Sync ESPN scores (default, runs frequently during games)
    if (syncType === "scores" || syncType === "all") {
      const response = await fetch(`${baseUrl}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: CURRENT_SEASON_YEAR,
          weeks: [1, 2, 3, 5],
        }),
      });
      results.scores = await response.json();
    }

    // Sync team odds (run a few times per week)
    if (syncType === "odds" || syncType === "all") {
      const response = await fetch(`${baseUrl}/api/odds?week=${currentWeek}`, {
        method: "POST",
      });
      results.odds = await response.json();
    }

    // Sync player props (run a few times per week, expensive API calls)
    if (syncType === "props" || syncType === "all") {
      const response = await fetch(`${baseUrl}/api/props?week=${currentWeek}`, {
        method: "POST",
      });
      results.props = await response.json();
    }

    return NextResponse.json({
      success: true,
      message: `Cron sync completed (type: ${syncType})`,
      currentWeek,
      results,
      triggeredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron sync error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Cron sync failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
