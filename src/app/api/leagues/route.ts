import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { createLeague } from "@/domain/leagues/create-league";
import { FreeLeagueLimitError } from "@/domain/errors";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { pickClockHoursSchema, scoringPresetNameSchema } from "@/domain/league-settings";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  teamName: z.string().trim().min(1).max(40),
  scoringPreset: scoringPresetNameSchema,
  pickClockHours: pickClockHoursSchema,
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const league = await createLeague(db, { userId: user.id, ...parsed.data });
    // Analytics: awaited but can never throw (captureServerEvent swallows errors), so it can't break the request.
    await captureServerEvent(user.id, ANALYTICS_EVENTS.LEAGUE_CREATED, { leagueId: league.id });
    return NextResponse.json({ leagueId: league.id, inviteCode: league.inviteCode }, { status: 201 });
  } catch (err) {
    if (err instanceof FreeLeagueLimitError) {
      // 402: premium required — Stripe checkout replaces this message in Phase 4
      return NextResponse.json({ error: err.message, code: err.code }, { status: 402 });
    }
    throw err;
  }
}
