import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getQueue, setQueue } from "@/domain/draft/queue";
import { DomainError, NotLeagueMemberError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    const items = await getQueue(db, { leagueId, userId: user.id });
    return NextResponse.json({
      queue: items.map((q) => ({ playerId: q.playerId, rank: q.rank })),
    });
  } catch (err) {
    if (err instanceof NotLeagueMemberError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

const bodySchema = z.object({ playerIds: z.array(z.string()).max(50) });

export async function PUT(req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await setQueue(db, { leagueId, userId: user.id, playerIds: parsed.data.playerIds });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotLeagueMemberError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    throw err;
  }
}
