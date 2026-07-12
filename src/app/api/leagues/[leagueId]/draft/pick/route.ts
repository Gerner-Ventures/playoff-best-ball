import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getDraftState } from "@/lib/draft-state";
import { safeAnnounceDraftState } from "@/lib/draft-events";
import { makePick } from "@/domain/draft/make-pick";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string }> };

const bodySchema = z.object({ playerId: z.string().min(1) });

export async function POST(req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await makePick(db, { leagueId, userId: user.id, playerId: parsed.data.playerId });
    await safeAnnounceDraftState(db, leagueId); // next clock + notification (or completion)
    return NextResponse.json(await getDraftState(db, leagueId, user.id), { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "This league's configuration is broken. Ask your commissioner to contact support." },
        { status: 500 },
      );
    }
    if (err instanceof DomainError) {
      // NOT_YOUR_TURN / PLAYER_UNAVAILABLE / NO_SLOT_FOR_POSITION / PICK_CONFLICT / DRAFT_NOT_ACTIVE
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    throw err;
  }
}
