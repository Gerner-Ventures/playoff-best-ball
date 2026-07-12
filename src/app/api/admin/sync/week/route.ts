import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { espnProvider } from "@/lib/stats/espn-provider";
import { syncWeekStats } from "@/domain/stats/sync-week";
import { CURRENT_SEASON } from "@/domain/season";

const bodySchema = z.object({ week: z.number().int().min(1).max(4) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const result = await syncWeekStats(db, espnProvider, {
    season: CURRENT_SEASON,
    week: parsed.data.week,
  });
  return NextResponse.json(result);
}
