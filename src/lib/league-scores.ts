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

/** The player who actually scores for this pick in this week, after substitutions. */
export function effectivePlayerForWeek(
  pick: { playerId: string },
  week: number,
  subsByOriginal: Map<string, { substitutePlayerId: string; effectiveWeek: number }>,
): string {
  const sub = subsByOriginal.get(pick.playerId);
  return sub && week >= sub.effectiveWeek ? sub.substitutePlayerId : pick.playerId;
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
          substitutions: {
            include: {
              substitutePlayer: { select: { id: true, name: true, position: true, nflTeam: true } },
            },
          },
        },
      },
    },
  });
  const settings = parseLeagueSettings(league.settings);
  const eliminated = await getEliminatedTeams(db, league.season);

  // One stats read for the whole league: every drafted OR substituted-in player's lines, all weeks.
  const scoringPlayerIds = [
    ...new Set(
      league.entries.flatMap((e) => [
        ...e.picks.map((p) => p.playerId),
        ...e.substitutions.map((s) => s.substitutePlayerId),
      ]),
    ),
  ];
  const statRows = await db.playerStat.findMany({
    where: { season: league.season, playerId: { in: scoringPlayerIds } },
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
    for (const sub of entry.substitutions) {
      playerById.set(sub.substitutePlayerId, sub.substitutePlayer);
    }
    const subsByOriginal = new Map(
      entry.substitutions.map((s) => [
        s.originalPlayerId,
        { substitutePlayerId: s.substitutePlayerId, effectiveWeek: s.effectiveWeek },
      ]),
    );
    const weeks: EntryWeekScore[] = ALL_WEEKS.map((week) => {
      const scored: ScoredPlayer[] = entry.picks.map((pick) => {
        const playerId = effectivePlayerForWeek(pick, week, subsByOriginal);
        return {
          playerId,
          // Substitutes share the original's position by domain rule.
          position: playerById.get(playerId)?.position ?? pick.player.position,
          points: pointsByPlayerWeek.get(`${playerId}:${week}`) ?? 0,
        };
      });
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
    // The CURRENT roster: substitutions resolved as of the latest playoff week.
    const latestWeek = Math.max(...ALL_WEEKS);
    const currentRoster = entry.picks.map(
      (pick) => playerById.get(effectivePlayerForWeek(pick, latestWeek, subsByOriginal))!,
    );
    return {
      entryId: entry.id,
      name: entry.name,
      ownerName: entry.membership.user.name,
      weeks,
      grandTotal: roundPoints(weeks.reduce((sum, w) => sum + w.total, 0)),
      alivePlayers: currentRoster.filter((p) => !eliminated.has(p.nflTeam)).length,
    };
  });

  entries.sort((a, b) => b.grandTotal - a.grandTotal);
  return { weeks: ALL_WEEKS, rosterSize: settings.rosterSlots.length, entries };
}
