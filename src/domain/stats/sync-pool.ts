import type { PrismaClient } from "@prisma/client";
import type { StatsProvider } from "./provider";

export interface SyncPoolInput {
  season: number;
  /** Playoff team abbreviations (admin-provided after Week 18). */
  teams: string[];
}

/**
 * Upserts the playoff player pool from provider rosters. Never deletes
 * (DraftPick/PlayerStat restrict player deletion anyway). Existing players are
 * matched by externalId first, then by (season, name, position) — which backfills
 * externalIds onto hand-seeded fixture players. New players get ranks appended
 * after the current max so hand-curated ranks survive.
 */
export async function syncPlayerPool(db: PrismaClient, provider: StatsProvider, input: SyncPoolInput) {
  let created = 0;
  let updated = 0;
  const maxRank = await db.player.aggregate({
    where: { season: input.season },
    _max: { defaultRank: true },
  });
  let nextRank = (maxRank._max.defaultRank ?? 0) + 1;

  for (const team of input.teams) {
    const roster = await provider.fetchTeamRoster(input.season, team);
    for (const p of roster) {
      const existing =
        (await db.player.findFirst({ where: { season: input.season, externalId: p.externalId } })) ??
        (await db.player.findUnique({
          where: { season_name_position: { season: input.season, name: p.name, position: p.position } },
        }));
      if (existing) {
        await db.player.update({
          where: { id: existing.id },
          data: { externalId: p.externalId, nflTeam: p.nflTeam },
        });
        updated += 1;
      } else {
        await db.player.create({
          data: {
            season: input.season,
            name: p.name,
            position: p.position,
            nflTeam: p.nflTeam,
            externalId: p.externalId,
            defaultRank: nextRank++,
          },
        });
        created += 1;
      }
    }
  }
  return { created, updated };
}
