import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { advanceMockWeek } from "@/domain/stats/mock-season";
import { detectSeasonSource, resolveSeasonSource, sourceIdFromInput } from "@/domain/stats/sources/resolve";
import { DEMO_MODE_REQUESTED } from "@/lib/demo-mode";
import { CURRENT_SEASON } from "@/domain/season";

const bodySchema = z.object({ source: z.string().optional() }).optional();

/** Advances the simulated playoff season one week — the beta's and demo's lever. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Hard gate: advancing a simulated week against real data would corrupt the
  // season. A demo deployment qualifies as simulated by definition.
  if (process.env.STATS_PROVIDER !== "fake" && !DEMO_MODE_REQUESTED) {
    return NextResponse.json(
      { error: "Mock week advancement requires STATS_PROVIDER=fake — this environment syncs real stats." },
      { status: 409 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    // Default to the source the season already holds, so the button keeps playing
    // whatever season is loaded rather than fabricating on top of it.
    const incumbent = await detectSeasonSource(db, CURRENT_SEASON);
    const sourceId = sourceIdFromInput(parsed.data?.source ?? incumbent ?? undefined);
    const source = await resolveSeasonSource(db, sourceId, CURRENT_SEASON);

    const result = await advanceMockWeek(db, { season: CURRENT_SEASON, source });
    return NextResponse.json({ ...result, source: sourceId });
  } catch (err) {
    // Domain failures worth surfacing: the season already finished, a source
    // mismatch, or an unknown source id. None are server faults.
    if (
      err instanceof Error &&
      (err.message.includes("complete") ||
        err.message.includes("already holds") ||
        err.message.includes("Unknown season source") ||
        err.message.includes("No captured season"))
    ) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
