import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { scheduleDraft } from "@/domain/draft/schedule-draft";
import { safeAnnounceScheduledStart } from "@/lib/draft-events";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string }> };

const bodySchema = z.object({
  scheduledAt: z.string().datetime().nullable(), // ISO from the client; null clears
  // (zod v4: if .datetime() is unavailable on z.string(), use z.iso.datetime() instead)
});

export async function PATCH(req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
  try {
    const league = await scheduleDraft(db, { leagueId, userId: user.id, scheduledAt });
    if (scheduledAt) await safeAnnounceScheduledStart(leagueId, scheduledAt);
    return NextResponse.json({
      draftScheduledAt: league.draftScheduledAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof DomainError) {
      const status = err.code === "NOT_COMMISSIONER" ? 403 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
