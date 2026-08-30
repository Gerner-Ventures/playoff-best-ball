import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { DomainError } from "@/domain/errors";
import { CURRENT_SEASON } from "@/domain/season";
import { mockDraftConfigSchema } from "@/domain/mock-draft/config";
import { startMockDraft, discardMockDraft } from "@/domain/mock-draft/start";
import { getMockDraftState } from "@/domain/mock-draft/state";
import { captureServerEvent } from "@/lib/analytics-server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json(await getMockDraftState(db, user.id));
}

/** Start a mock draft, replacing any in progress. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = mockDraftConfigSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    await startMockDraft(db, { userId: user.id, season: CURRENT_SEASON, config: parsed.data });
    await captureServerEvent(user.id, ANALYTICS_EVENTS.MOCK_DRAFT_STARTED, {
      team_count: parsed.data.teamCount,
    });
    return NextResponse.json(await getMockDraftState(db, user.id), { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid mock draft configuration." }, { status: 400 });
    }
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await discardMockDraft(db, user.id);
  return NextResponse.json({ ok: true });
}
