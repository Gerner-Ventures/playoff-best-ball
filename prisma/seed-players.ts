import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

const fileSchema = z.object({
  season: z.number().int(),
  players: z.array(
    z.object({
      name: z.string().min(1),
      position: z.enum(["QB", "RB", "WR", "TE", "K", "DST"]),
      nflTeam: z.string().min(2).max(3),
      defaultRank: z.number().int().positive(),
    }),
  ),
});

export const PLAYERS_FIXTURE = path.join(__dirname, "..", "data", "players-2026.json");

/** Idempotent: upserts by (season, name, position); safe to re-run after editing the fixture. */
export async function seedPlayers(db: PrismaClient, filePath: string) {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  const { season, players } = fileSchema.parse(raw);
  for (const p of players) {
    await db.player.upsert({
      where: { season_name_position: { season, name: p.name, position: p.position } },
      create: { season, ...p },
      update: { nflTeam: p.nflTeam, defaultRank: p.defaultRank },
    });
  }
  return players.length;
}
