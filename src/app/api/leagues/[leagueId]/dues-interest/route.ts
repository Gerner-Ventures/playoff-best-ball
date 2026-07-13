import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { recordDuesInterest } from "@/domain/leagues/dues";
import { DomainError } from "@/domain/errors";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

type Params = { params: Promise<{ leagueId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const { alreadyRecorded } = await recordDuesInterest(db, { leagueId, userId: user.id });
    if (!alreadyRecorded) {
      // Analytics: awaited but can never throw (captureServerEvent swallows errors), so it can't break the request.
      await captureServerEvent(user.id, ANALYTICS_EVENTS.DUES_INTEREST, { leagueId });
    }
    return NextResponse.json({ ok: true, alreadyRecorded }, { status: 201 });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
    }
    throw err;
  }
}
