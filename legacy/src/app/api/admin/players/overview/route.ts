import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR, BYE_TEAMS_2025 } from "@/lib/constants";
import { getEliminatedTeams } from "@/lib/espn/client";

export const dynamic = "force-dynamic";

interface PlayerOverview {
  playerId: string;
  playerName: string;
  position: string;
  team: string | null;
  espnId: string | null;
  hasEspnId: boolean;
  ownerId: string;
  ownerName: string;
  rosterSlot: string;
  rosterId: string;
  isEliminated: boolean;
  isByeTeam: boolean;
  // Scores by week
  scores: {
    week: number;
    points: number | null;
    isBye: boolean;
  }[];
  totalPoints: number;
  // Substitution data
  hasSubstitution: boolean;
  substitution?: {
    id: string;
    effectiveWeek: number;
    reason: string | null;
    isActive: boolean;
    substitutePlayer: {
      id: string;
      name: string;
      position: string;
      team: string | null;
      espnId: string | null;
    };
  } | null;
}

// GET /api/admin/players/overview - Get comprehensive view of all rostered players
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || String(CURRENT_SEASON_YEAR));
    const teamFilter = searchParams.get("team")?.toUpperCase() || null;
    const matchedFilter = searchParams.get("matched"); // "true", "false", or null
    const weekFilter = searchParams.get("week") ? parseInt(searchParams.get("week")!) : null;
    const hasScores = searchParams.get("hasScores"); // "true" or "false" for week filter

    const byeTeams = new Set(BYE_TEAMS_2025);
    const eliminatedTeams = await getEliminatedTeams();

    // Playoff weeks
    const WEEKS = [1, 2, 3, 5];

    // Get all rosters with players, scores, and substitutions
    const rosters = await prisma.roster.findMany({
      where: { year },
      include: {
        owner: true,
        player: {
          include: {
            scores: {
              where: { year },
              orderBy: { week: "asc" },
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
                  orderBy: { week: "asc" },
                },
              },
            },
          },
        },
      },
      orderBy: [{ owner: { name: "asc" } }, { rosterSlot: "asc" }],
    });

    // Determine current week based on eliminated teams count
    const eliminatedCount = eliminatedTeams.size;
    const currentWeek =
      eliminatedCount < 6 ? 1 : eliminatedCount < 10 ? 2 : eliminatedCount < 12 ? 3 : 5;

    // Transform to overview format
    let players: PlayerOverview[] = rosters.map((roster) => {
      const substitution = roster.substitutions[0]; // Max one per roster per year
      const hasSubstitutionRecord = !!substitution;
      const isSubstitutionActive =
        hasSubstitutionRecord && currentWeek >= substitution.effectiveWeek;

      // For elimination check, use substitute's team if substitution is active
      const activeTeam =
        isSubstitutionActive && substitution
          ? substitution.substitutePlayer.team?.toUpperCase()
          : roster.player.team?.toUpperCase();
      const playerTeam = roster.player.team?.toUpperCase() || null;
      const isByeTeam = playerTeam ? byeTeams.has(playerTeam) : false;
      const isEliminated = activeTeam ? eliminatedTeams.has(activeTeam) : false;

      // Build scores array for each week - handle substitution logic
      const originalScoresMap = new Map(roster.player.scores.map((s) => [s.week, s.points]));
      const subScoresMap = hasSubstitutionRecord
        ? new Map(substitution.substitutePlayer.scores.map((s) => [s.week, s.points]))
        : new Map();

      const scores = WEEKS.map((week) => {
        // Bye teams don't play in Wild Card (week 1)
        const isBye = week === 1 && isByeTeam;

        let points: number | null;
        if (hasSubstitutionRecord && week >= substitution.effectiveWeek) {
          // Use substitute's score from effective week onwards
          points = subScoresMap.get(week) ?? null;
        } else {
          // Use original player's score
          points = originalScoresMap.get(week) ?? null;
        }

        return {
          week,
          points: isBye ? null : points,
          isBye,
        };
      });

      const totalPoints = scores.reduce((sum, s) => sum + (s.points || 0), 0);

      return {
        playerId: roster.player.id,
        playerName: roster.player.name,
        position: roster.player.position,
        team: roster.player.team,
        espnId: roster.player.espnId,
        hasEspnId: !!roster.player.espnId,
        ownerId: roster.owner.id,
        ownerName: roster.owner.name,
        rosterSlot: roster.rosterSlot,
        rosterId: roster.id,
        isEliminated,
        isByeTeam,
        scores,
        totalPoints,
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
            }
          : null,
      };
    });

    // Apply filters
    if (teamFilter) {
      players = players.filter((p) => p.team?.toUpperCase() === teamFilter);
    }

    if (matchedFilter === "true") {
      players = players.filter((p) => p.hasEspnId);
    } else if (matchedFilter === "false") {
      players = players.filter((p) => !p.hasEspnId);
    }

    if (weekFilter !== null && hasScores !== null) {
      const weekIndex = WEEKS.indexOf(weekFilter);
      if (weekIndex !== -1) {
        if (hasScores === "true") {
          players = players.filter((p) => p.scores[weekIndex].points !== null);
        } else {
          players = players.filter(
            (p) => p.scores[weekIndex].points === null && !p.scores[weekIndex].isBye
          );
        }
      }
    }

    // Calculate summary stats
    const totalPlayers = players.length;
    const withEspnId = players.filter((p) => p.hasEspnId).length;
    const withoutEspnId = players.filter((p) => !p.hasEspnId).length;
    const onActiveTeams = players.filter((p) => !p.isEliminated).length;
    const onEliminatedTeams = players.filter((p) => p.isEliminated).length;

    // Get unique teams for filter dropdown
    const uniqueTeams = [...new Set(players.map((p) => p.team).filter(Boolean))].sort() as string[];

    // Score coverage by week
    const scoreCoverage = WEEKS.map((week) => {
      const weekIndex = WEEKS.indexOf(week);
      const playersWithScores = players.filter(
        (p) => p.scores[weekIndex].points !== null || p.scores[weekIndex].isBye
      ).length;
      const playersExpected = players.filter((p) => !p.scores[weekIndex].isBye).length;
      const byeCount = players.filter((p) => p.scores[weekIndex].isBye).length;

      return {
        week,
        label:
          week === 1
            ? "Wild Card"
            : week === 2
              ? "Divisional"
              : week === 3
                ? "Conf Champ"
                : "Super Bowl",
        playersWithScores,
        playersExpected,
        byeCount,
        coverage: playersExpected > 0 ? Math.round((playersWithScores / playersExpected) * 100) : 0,
      };
    });

    return NextResponse.json({
      players,
      summary: {
        total: totalPlayers,
        withEspnId,
        withoutEspnId,
        onActiveTeams,
        onEliminatedTeams,
      },
      scoreCoverage,
      teams: uniqueTeams,
      eliminatedTeams: Array.from(eliminatedTeams),
      byeTeams: Array.from(byeTeams),
      year,
    });
  } catch (error) {
    console.error("Error fetching players overview:", error);
    return NextResponse.json({ error: "Failed to fetch players overview" }, { status: 500 });
  }
}
