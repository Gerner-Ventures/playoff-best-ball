import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { espnProvider } from "@/lib/stats/espn-provider";
import { syncPlayerPool } from "@/domain/stats/sync-pool";
import { CURRENT_SEASON } from "@/domain/season";

const bodySchema = z.object({ teams: z.array(z.string().min(2).max(3)).min(1).max(14) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const result = await syncPlayerPool(db, espnProvider, {
    season: CURRENT_SEASON,
    teams: parsed.data.teams.map((t) => t.toUpperCase()),
  });
  return NextResponse.json(result);
}
