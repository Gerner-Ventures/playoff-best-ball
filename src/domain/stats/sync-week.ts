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
        startsAt: g.startsAt, state: g.state,
        homeScore: g.homeScore, awayScore: g.awayScore,
      },
    });
  }

  for (const g of games) {
    if (g.state === "SCHEDULED") continue;
    const lines = await provider.fetchGameStats(g.eventId);
    for (const line of lines) {
      const player = await db.player.findFirst({
        where: { season: input.season, externalId: line.externalId },
      });
      if (!player) {
        unmatched.push(`${line.name} (${line.externalId})`);
        continue;
      }
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
