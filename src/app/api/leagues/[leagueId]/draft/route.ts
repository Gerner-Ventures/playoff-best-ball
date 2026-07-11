import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { getDraftState } from "@/lib/draft-state";
import { safeAnnounceDraftState } from "@/lib/draft-events";
import { startDraft } from "@/domain/draft/start-draft";
import { DomainError } from "@/domain/errors";

type Params = { params: Promise<{ leagueId: string }> };

async function requireMember(leagueId: string) {
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId: user.id } },
  });
  if (!membership) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { user, membership };
}

export async function GET(_req: Request, { params }: Params) {
  const { leagueId } = await params;
  const auth = await requireMember(leagueId);
  if ("error" in auth) return auth.error;
  return NextResponse.json(await getDraftState(db, leagueId, auth.user.id));
}

export async function POST(_req: Request, { params }: Params) {
  const { leagueId } = await params;
  const auth = await requireMember(leagueId);
  if ("error" in auth) return auth.error;

  try {
    await startDraft(db, { leagueId, userId: auth.user.id });
    await safeAnnounceDraftState(db, leagueId); // arms the first pick clock + notification
    return NextResponse.json(await getDraftState(db, leagueId, auth.user.id), { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "This league's configuration is broken. Ask your commissioner to contact support." },
        { status: 500 },
      );
    }
    if (err instanceof DomainError) {
      const status = err.code === "NOT_COMMISSIONER" ? 403 : 409;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
