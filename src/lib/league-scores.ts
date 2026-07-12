import type { PrismaClient } from "@prisma/client";
import { parseLeagueSettings } from "@/domain/league-settings";
import { computePoints, roundPoints } from "@/domain/scoring/compute-points";
import { optimalLineup, type ScoredPlayer } from "@/domain/scoring/best-ball";
import { tryParseStatLine } from "@/domain/stats/stat-line";
import { getEliminatedTeams } from "@/domain/stats/eliminated-teams";
import { PLAYOFF_WEEKS } from "@/domain/season";

const ALL_WEEKS = Object.values(PLAYOFF_WEEKS);

export interface EntryWeekScore {
  week: number;
  total: number;
  lineup: {
    slotIndex: number;
    slotLabel: string;
    playerId: string | null;
    playerName: string | null;
    position: string | null;
    points: number;
    teamEliminated: boolean;
  }[];
  /** Drafted players who scored but didn't make the optimal lineup. */
  bench: { playerId: string; playerName: string; position: string; points: number }[];
}

export interface LeagueScores {
  weeks: number[];
  /** How many lineup slots each entry fields (settings.rosterSlots.length). */
  rosterSize: number;
  entries: {
    entryId: string;
    name: string;
    ownerName: string;
    weeks: EntryWeekScore[];
    grandTotal: number;
    /** Distinct rostered players whose NFL team has not been eliminated. */
    alivePlayers: number;
  }[];
}

/** Leaderboard + weekly optimal lineups, computed at read from raw stats × league scoring. */
export async function getLeagueScores(db: PrismaClient, leagueId: string): Promise<LeagueScores> {
  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: {
      entries: {
        orderBy: { createdAt: "asc" },
        include: {
          membership: { include: { user: { select: { name: true } } } },
          picks: { include: { player: { select: { id: true, name: true, position: true, nflTeam: true } } } },
        },
      },
    },
  });
  const settings = parseLeagueSettings(league.settings);
  const eliminated = await getEliminatedTeams(db, league.season);

  // One stats read for the whole league: every drafted player's lines, all weeks.
  const draftedPlayerIds = [...new Set(league.entries.flatMap((e) => e.picks.map((p) => p.playerId)))];
  const statRows = await db.playerStat.findMany({
    where: { season: league.season, playerId: { in: draftedPlayerIds } },
  });
  const pointsByPlayerWeek = new Map<string, number>();
  for (const row of statRows) {
    const line = tryParseStatLine(row.stats);
    if (!line) continue; // corrupt row: skip rather than 500 a leaderboard
    pointsByPlayerWeek.set(
      `${row.playerId}:${row.week}`,
      roundPoints(computePoints(line, settings.scoring).total),
    );
  }

  const entries = league.entries.map((entry) => {
    const playerById = new Map(entry.picks.map((p) => [p.playerId, p.player]));
    const weeks: EntryWeekScore[] = ALL_WEEKS.map((week) => {
      const scored: ScoredPlayer[] = entry.picks.map((pick) => ({
        playerId: pick.playerId,
        position: pick.player.position,
        points: pointsByPlayerWeek.get(`${pick.playerId}:${week}`) ?? 0,
      }));
      const { slots, total } = optimalLineup(settings.rosterSlots, scored);
      const usedIds = new Set(slots.map((s) => s.playerId).filter(Boolean));
      return {
        week,
        total: roundPoints(total),
        lineup: slots.map((s) => ({
          slotIndex: s.slotIndex,
          slotLabel: settings.rosterSlots[s.slotIndex].slot,
          playerId: s.playerId,
          playerName: s.playerId ? (playerById.get(s.playerId)?.name ?? null) : null,
          position: s.playerId ? (playerById.get(s.playerId)?.position ?? null) : null,
          points: s.points,
          teamEliminated: s.playerId
            ? eliminated.has(playerById.get(s.playerId)?.nflTeam ?? "")
            : false,
        })),
        bench: scored
          .filter((p) => !usedIds.has(p.playerId) && p.points > 0)
          .map((p) => ({
            playerId: p.playerId,
            playerName: playerById.get(p.playerId)?.name ?? "?",
            position: playerById.get(p.playerId)?.position ?? "?",
            points: p.points,
          })),
      };
    });
    return {
      entryId: entry.id,
      name: entry.name,
      ownerName: entry.membership.user.name,
      weeks,
      grandTotal: roundPoints(weeks.reduce((sum, w) => sum + w.total, 0)),
      alivePlayers: [...playerById.values()].filter((p) => !eliminated.has(p.nflTeam)).length,
    };
  });

  entries.sort((a, b) => b.grandTotal - a.grandTotal);
  return { weeks: ALL_WEEKS, rosterSize: settings.rosterSlots.length, entries };
}
