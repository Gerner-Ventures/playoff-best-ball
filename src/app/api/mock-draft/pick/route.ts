import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { DomainError } from "@/domain/errors";
import { makeMockPick } from "@/domain/mock-draft/pick";
import { getMockDraftState } from "@/domain/mock-draft/state";

const bodySchema = z.object({ playerId: z.string().min(1) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await makeMockPick(db, { userId: user.id, playerId: parsed.data.playerId });
    return NextResponse.json(await getMockDraftState(db, user.id), { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "This mock draft's configuration is broken." }, { status: 500 });
    }
    if (err instanceof DomainError) {
      // NOT_YOUR_TURN / PLAYER_UNAVAILABLE / NO_SLOT_FOR_POSITION / DRAFT_NOT_ACTIVE
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    throw err;
  }
}
