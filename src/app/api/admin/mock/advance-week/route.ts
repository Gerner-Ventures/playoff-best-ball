import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { advanceMockWeek } from "@/domain/stats/mock-season";
import { CURRENT_SEASON } from "@/domain/season";

/** Advances the simulated playoff season one week — the December beta's lever. */
export async function POST() {
  const user = await getSessionUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Hard gate: advancing a mock week against real data would corrupt the season.
  if (process.env.STATS_PROVIDER !== "fake") {
    return NextResponse.json(
      { error: "Mock week advancement requires STATS_PROVIDER=fake — this environment syncs real stats." },
      { status: 409 },
    );
  }
  try {
    const result = await advanceMockWeek(db, { season: CURRENT_SEASON });
    return NextResponse.json(result);
  } catch (err) {
    // The only advanceMockWeek domain failure: the mock season already finished.
    if (err instanceof Error && err.message.includes("complete")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
