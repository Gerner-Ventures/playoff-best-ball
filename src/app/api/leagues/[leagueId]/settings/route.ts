import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { updateLeagueSettings } from "@/domain/leagues/update-settings";
import { DomainError } from "@/domain/errors";
import { scoringPresetNameSchema, scoringSettingsSchema } from "@/domain/league-settings";

type Params = { params: Promise<{ leagueId: string }> };

const bodySchema = z.object({
  scoringPreset: scoringPresetNameSchema.optional(),
  scoring: scoringSettingsSchema.optional(),
  entryFeeCents: z.number().int().nonnegative().max(100_000_00).nullable().optional(),
  venmoHandle: z.string().trim().min(1).max(40).nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const league = await updateLeagueSettings(db, { leagueId, userId: user.id, ...parsed.data });
    return NextResponse.json({ ok: true, tier: league.tier });
  } catch (err) {
    if (err instanceof DomainError) {
      const status =
        err.code === "NOT_COMMISSIONER" ? 403 : err.code === "PREMIUM_REQUIRED" ? 402 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
