import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { CURRENT_SEASON } from "@/domain/season";

/** The season's player pool. Static per season — clients fetch once per draft-room visit. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const players = await db.player.findMany({
    where: { season: CURRENT_SEASON },
    orderBy: { defaultRank: "asc" },
    select: { id: true, name: true, position: true, nflTeam: true, defaultRank: true },
  });
  return NextResponse.json({ players });
}
