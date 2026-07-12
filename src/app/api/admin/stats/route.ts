import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { statLineSchema } from "@/domain/stats/stat-line";
import { CURRENT_SEASON } from "@/domain/season";

const bodySchema = z.object({
  playerId: z.string().min(1),
  week: z.number().int().min(1).max(4),
  stats: statLineSchema, // full replacement, zod-validated
});

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { playerId, week, stats } = parsed.data;
  const player = await db.player.findUnique({ where: { id: playerId } });
  if (!player) return NextResponse.json({ error: "Unknown player" }, { status: 404 });
  if (player.season !== CURRENT_SEASON) {
    return NextResponse.json({ error: "Unknown player" }, { status: 404 });
  }
  const row = await db.playerStat.upsert({
    where: { playerId_season_week: { playerId, season: CURRENT_SEASON, week } },
    create: { playerId, season: CURRENT_SEASON, week, stats: stats as Prisma.InputJsonValue },
    update: { stats: stats as Prisma.InputJsonValue },
  });
  console.warn(`[admin] manual stat override by ${user!.email}: player ${playerId} week ${week}`);
  return NextResponse.json({ ok: true, id: row.id });
}
