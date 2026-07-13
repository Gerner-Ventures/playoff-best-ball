import type { PrismaClient } from "@prisma/client";
import { parseLeagueSettings } from "@/domain/league-settings";
import { computePoints, roundPoints } from "@/domain/scoring/compute-points";
import { optimalLineup, type ScoredPlayer } from "@/domain/scoring/best-ball";
import { tryParseStatLine } from "@/domain/stats/stat-line";
import { getEliminatedTeams } from "@/domain/stats/eliminated-teams";
import { projectPoints } from "@/domain/odds/projections";
import { effectivePlayerForWeek } from "@/lib/league-scores";

const NO_ODDS_WIN_PROB = 0.5; // fair-coin fallback when the odds sync hasn't run

export interface LeagueProjections {
  nextWeek: number | null; // null once the Super Bowl is final
  entries: {
    entryId: string;
    name: string;
    projectedTotal: number; // optimal-lineup EV for next week
    players: {
      playerId: string;
      name: string;
      ev: number;
      winProb: number | null;
      eliminated: boolean;
    }[];
  }[];
}

/** Premium analytics: next-week expected value = recency projection × win probability. */
export async function getLeagueProjections(
  db: PrismaClient,
  leagueId: string,
): Promise<LeagueProjections> {
  const league = await db.league.findUniqueOrThrow({
    where: { id: leagueId },
    include: {
      entries: {
        orderBy: { createdAt: "asc" },
        include: {
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

  const games = await db.nflGame.findMany({ where: { season: league.season } });
  const unfinished = games.filter((g) => g.state !== "FINAL").map((g) => g.week);
  const nextWeek = unfinished.length > 0 ? Math.min(...unfinished) : null;
  if (nextWeek === null) return { nextWeek, entries: [] };

  // Stat history for projections: one query for all rostered + substitute players.
  const playerIds = [
    ...new Set(
      league.entries.flatMap((e) => [
        ...e.picks.map((p) => p.playerId),
        ...e.substitutions.map((s) => s.substitutePlayerId),
      ]),
    ),
  ];
  const statRows = await db.playerStat.findMany({
    where: { season: league.season, playerId: { in: playerIds } },
  });
  const gamesByPlayer = new Map<string, { week: number; points: number }[]>();
  for (const row of statRows) {
    const line = tryParseStatLine(row.stats);
    if (!line) continue; // corrupt row: skip rather than 500 the analytics page
    const list = gamesByPlayer.get(row.playerId) ?? [];
    list.push({ week: row.week, points: roundPoints(computePoints(line, settings.scoring).total) });
    gamesByPlayer.set(row.playerId, list);
  }
  const odds = await db.teamOdds.findMany({ where: { season: league.season, week: nextWeek } });
  const winProbByTeam = new Map(odds.map((o) => [o.team, o.winProb]));

  const entries = league.entries.map((entry) => {
    const subsByOriginal = new Map(
      entry.substitutions.map((s) => [
        s.originalPlayerId,
        { substitutePlayerId: s.substitutePlayerId, effectiveWeek: s.effectiveWeek },
      ]),
    );
    const playerMeta = new Map(
      [...entry.picks.map((p) => p.player), ...entry.substitutions.map((s) => s.substitutePlayer)]
        .map((p) => [p.id, p]),
    );
    // No dedupe needed on effective ids: the substitution domain guard forbids
    // substituting in a player already rostered/substituted within the entry.
    const players = entry.picks.map((pick) => {
      const effectiveId = effectivePlayerForWeek(pick, nextWeek, subsByOriginal);
      const meta = playerMeta.get(effectiveId)!;
      const isOut = eliminated.has(meta.nflTeam);
      const winProb = isOut ? 0 : (winProbByTeam.get(meta.nflTeam) ?? null);
      const projection = projectPoints(meta.position, gamesByPlayer.get(effectiveId) ?? []);
      const ev = roundPoints(projection.projectedPoints * (isOut ? 0 : (winProb ?? NO_ODDS_WIN_PROB)));
      return { playerId: effectiveId, name: meta.name, ev, winProb, eliminated: isOut, position: meta.position };
    });
    const scored: ScoredPlayer[] = players.map((p) => ({
      playerId: p.playerId,
      position: p.position,
      points: p.ev,
    }));
    const { total } = optimalLineup(settings.rosterSlots, scored);
    return {
      entryId: entry.id,
      name: entry.name,
      projectedTotal: roundPoints(total),
      players: players.map((p) => ({
        playerId: p.playerId,
        name: p.name,
        ev: p.ev,
        winProb: p.winProb,
        eliminated: p.eliminated,
      })),
    };
  });

  entries.sort((a, b) => b.projectedTotal - a.projectedTotal);
  return { nextWeek, entries };
}
