import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { joinLeague } from "@/domain/leagues/join-league";
import { InvalidInviteError, LeagueFullError } from "@/domain/errors";
import { leagueSettingsSchema } from "@/domain/league-settings";

type Params = { params: Promise<{ code: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { code } = await params;
  const league = await db.league.findUnique({
    where: { inviteCode: code.toUpperCase() },
    include: { _count: { select: { entries: true } } },
  });
  if (!league) return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  const settings = leagueSettingsSchema.parse(league.settings);
  return NextResponse.json({
    name: league.name,
    season: league.season,
    entryCount: league._count.entries,
    maxEntries: settings.maxEntries,
  });
}

const bodySchema = z.object({ teamName: z.string().trim().min(1).max(40) });

export async function POST(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { code } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const entry = await joinLeague(db, {
      userId: user.id,
      inviteCode: code,
      teamName: parsed.data.teamName,
    });
    return NextResponse.json({ leagueId: entry.leagueId }, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidInviteError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof LeagueFullError) {
      return NextResponse.json({ error: err.message, code: "LEAGUE_FULL" }, { status: 409 });
    }
    throw err;
  }
}
