import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { joinLeague } from "@/domain/leagues/join-league";
import { InvalidInviteError, LeagueFullError } from "@/domain/errors";

type Params = { params: Promise<{ code: string }> };

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
      return NextResponse.json({ error: err.message, code: "INVALID_INVITE" }, { status: 404 });
    }
    if (err instanceof LeagueFullError) {
      return NextResponse.json({ error: err.message, code: "LEAGUE_FULL" }, { status: 409 });
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "This league's configuration is broken. Ask your commissioner to contact support." },
        { status: 500 },
      );
    }
    throw err;
  }
}
