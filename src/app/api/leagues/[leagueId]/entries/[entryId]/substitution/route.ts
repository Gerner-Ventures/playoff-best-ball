import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { setSubstitution, clearSubstitution } from "@/domain/leagues/substitutions";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string; entryId: string }> };

const putSchema = z.object({
  originalPlayerId: z.string().min(1),
  substitutePlayerId: z.string().min(1),
  effectiveWeek: z.number().int().min(1).max(4),
  reason: z.string().trim().max(80).optional(),
});

export async function PUT(req: Request, { params }: Params) {
  const { leagueId, entryId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const sub = await setSubstitution(db, { leagueId, userId: user.id, entryId, ...parsed.data });
    return NextResponse.json({ ok: true, id: sub.id });
  } catch (err) {
    if (err instanceof DomainError) {
      const status = err.code === "NOT_COMMISSIONER" ? 403 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}

const deleteSchema = z.object({ originalPlayerId: z.string().min(1) });

export async function DELETE(req: Request, { params }: Params) {
  const { leagueId, entryId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await clearSubstitution(db, {
      leagueId,
      userId: user.id,
      entryId,
      originalPlayerId: parsed.data.originalPlayerId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DomainError) {
      const status = err.code === "NOT_COMMISSIONER" ? 403 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
