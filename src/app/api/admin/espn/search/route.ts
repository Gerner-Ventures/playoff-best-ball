import { NextRequest, NextResponse } from "next/server";

const ESPN_ATHLETE_SEARCH_URL = "https://site.web.api.espn.com/apis/common/v3/search";

interface ESPNSearchResult {
  id: string;
  uid: string;
  guid: string;
  type: string;
  displayName: string;
  shortName: string;
  description?: string;
  position?: string;
  team?: {
    id: string;
    displayName: string;
    abbreviation: string;
  };
}

interface ESPNSearchResponse {
  results: ESPNSearchResult[];
  total: number;
}

// GET /api/admin/espn/search?name=Patrick%20Mahomes
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name");

    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    // Search ESPN for NFL athletes
    const url = `${ESPN_ATHLETE_SEARCH_URL}?query=${encodeURIComponent(name)}&limit=10&mode=prefix&type=player&sport=football&league=nfl`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!response.ok) {
      throw new Error(`ESPN search failed: ${response.status}`);
    }

    const data: ESPNSearchResponse = await response.json();

    // Transform results to extract useful info
    const players = (data.results || [])
      .filter((r) => r.type === "player")
      .map((r) => ({
        espnId: r.id,
        name: r.displayName,
        shortName: r.shortName,
        position: r.position || null,
        team: r.team?.abbreviation || null,
        teamName: r.team?.displayName || null,
      }));

    return NextResponse.json({
      query: name,
      results: players,
      total: players.length,
    });
  } catch (error) {
    console.error("ESPN search error:", error);
    return NextResponse.json({ error: "Failed to search ESPN" }, { status: 500 });
  }
}
