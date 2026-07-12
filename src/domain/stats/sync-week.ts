import { Prisma, type PrismaClient } from "@prisma/client";
import type { StatsProvider } from "./provider";

export interface SyncWeekInput {
  season: number;
  week: number;
}

export interface SyncWeekResult {
  games: number;
  statLines: number;
  /** "Name (externalId)" for stat lines whose player isn't in the pool — admin fixes via pool sync. */
  unmatched: string[];
}

/** Idempotent: upserts NflGame rows and PlayerStat lines for one playoff week. */
export async function syncWeekStats(
  db: PrismaClient,
  provider: StatsProvider,
  input: SyncWeekInput,
): Promise<SyncWeekResult> {
  const games = await provider.fetchWeekGames(input.season, input.week);
  const unmatched: string[] = [];
  let statLines = 0;

  for (const g of games) {
    await db.nflGame.upsert({
      where: { eventId: g.eventId },
      create: {
        season: input.season, week: input.week, eventId: g.eventId,
        homeTeam: g.homeTeam, awayTeam: g.awayTeam, startsAt: g.startsAt,
        state: g.state, homeScore: g.homeScore, awayScore: g.awayScore,
      },
      update: {
        homeTeam: g.homeTeam, awayTeam: g.awayTeam,
        startsAt: g.startsAt, state: g.state,
        homeScore: g.homeScore, awayScore: g.awayScore,
      },
    });
  }

  for (const g of games) {
    if (g.state === "SCHEDULED") continue;
    const lines = await provider.fetchGameStats(g.eventId);
    // One query per game, not per line — Neon round-trips add up during the 2-minute live cron.
    const players = await db.player.findMany({
      where: { season: input.season, externalId: { in: lines.map((l) => l.externalId) } },
    });
    const playerByExternalId = new Map(players.map((p) => [p.externalId, p]));

    // Batch-load existing PlayerStat rows to check for manual overrides.
    const matchedPlayerIds = players.map((p) => p.id);
    const existingStats = matchedPlayerIds.length
      ? await db.playerStat.findMany({
          where: {
            playerId: { in: matchedPlayerIds },
            season: input.season,
            week: input.week,
          },
          select: { playerId: true, manualOverride: true },
        })
      : [];
    const manualOverridePlayerIds = new Set(
      existingStats.filter((s) => s.manualOverride).map((s) => s.playerId),
    );

    for (const line of lines) {
      const player = playerByExternalId.get(line.externalId);
      if (!player) {
        unmatched.push(`${line.name} (${line.externalId})`);
        continue;
      }
      // Skip rows protected by a manual override — they survive until an admin clears the flag.
      if (manualOverridePlayerIds.has(player.id)) continue;
      await db.playerStat.upsert({
        where: {
          playerId_season_week: { playerId: player.id, season: input.season, week: input.week },
        },
        create: {
          playerId: player.id, season: input.season, week: input.week,
          stats: line.stats as Prisma.InputJsonValue, eventId: g.eventId,
        },
        update: { stats: line.stats as Prisma.InputJsonValue, eventId: g.eventId },
      });
      statLines += 1;
    }
  }

  if (unmatched.length > 0) {
    console.warn(
      `[sync-week] ${unmatched.length} unmatched stat lines for season ${input.season} week ${input.week}: ${unmatched.join(", ")}`,
    );
  }
  return { games: games.length, statLines, unmatched };
}
