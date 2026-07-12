import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { recordDuesInterest } from "@/domain/leagues/dues";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    await recordDuesInterest(db, { leagueId, userId: user.id });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
    }
    throw err;
  }
}
