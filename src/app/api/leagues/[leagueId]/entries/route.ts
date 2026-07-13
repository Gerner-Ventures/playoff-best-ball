import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { addEntry } from "@/domain/leagues/add-entry";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string }> };

const bodySchema = z.object({ teamName: z.string().trim().min(1).max(40) });

export async function POST(req: Request, { params }: Params) {
  const { leagueId } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const entry = await addEntry(db, { leagueId, userId: user.id, teamName: parsed.data.teamName });
    return NextResponse.json({ ok: true, entryId: entry.id }, { status: 201 });
  } catch (err) {
    if (err instanceof DomainError) {
      const status =
        err.code === "PREMIUM_REQUIRED" ? 402 : err.code === "NOT_LEAGUE_MEMBER" ? 404 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
