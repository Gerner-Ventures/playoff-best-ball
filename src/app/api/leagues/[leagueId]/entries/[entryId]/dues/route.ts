import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { setDuesPaid } from "@/domain/leagues/dues";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string; entryId: string }> };

const bodySchema = z.object({ paid: z.boolean() });

export async function PATCH(req: Request, { params }: Params) {
  const { leagueId, entryId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const entry = await setDuesPaid(db, {
      leagueId, userId: user.id, entryId, paid: parsed.data.paid,
    });
    return NextResponse.json({ ok: true, duesPaid: entry.duesPaid });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
    }
    if (err instanceof Error && /entry not in league/i.test(err.message)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}
