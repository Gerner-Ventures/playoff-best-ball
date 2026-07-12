import type { PrismaClient } from "@prisma/client";
import { CURRENT_SEASON } from "../season";

export interface DueWork {
  leagueId: string;
  week: number;
}

const PREVIEW_HORIZON_MS = 48 * 3600 * 1000;

async function leaguesWithCompleteDrafts(db: PrismaClient) {
  return db.league.findMany({
    where: { season: CURRENT_SEASON, draft: { status: "COMPLETE" } },
    select: { id: true, lastRecapWeek: true, lastPreviewWeek: true },
  });
}

/** Weeks whose games are ALL final (and exist), per league above its watermark. */
export async function findDueRecaps(db: PrismaClient): Promise<DueWork[]> {
  const games = await db.nflGame.findMany({
    where: { season: CURRENT_SEASON },
    select: { week: true, state: true },
  });
  const finishedWeeks = new Set<number>();
  const weeks = new Set(games.map((g) => g.week));
  for (const week of weeks) {
    const ofWeek = games.filter((g) => g.week === week);
    if (ofWeek.length > 0 && ofWeek.every((g) => g.state === "FINAL")) finishedWeeks.add(week);
  }
  if (finishedWeeks.size === 0) return [];

  const leagues = await leaguesWithCompleteDrafts(db);
  const due: DueWork[] = [];
  for (const league of leagues) {
    for (const week of [...finishedWeeks].sort((a, b) => a - b)) {
      if (week > league.lastRecapWeek) due.push({ leagueId: league.id, week });
    }
  }
  return due;
}

/** Weeks with games starting within the horizon, per league above its watermark. */
export async function findDuePreviews(db: PrismaClient): Promise<DueWork[]> {
  const now = Date.now();
  const upcoming = await db.nflGame.findMany({
    where: {
      season: CURRENT_SEASON,
      state: "SCHEDULED",
      startsAt: { gte: new Date(now), lte: new Date(now + PREVIEW_HORIZON_MS) },
    },
    select: { week: true },
  });
  const dueWeeks = [...new Set(upcoming.map((g) => g.week))].sort((a, b) => a - b);
  if (dueWeeks.length === 0) return [];

  const leagues = await leaguesWithCompleteDrafts(db);
  const due: DueWork[] = [];
  for (const league of leagues) {
    for (const week of dueWeeks) {
      if (week > league.lastPreviewWeek) due.push({ leagueId: league.id, week });
    }
  }
  return due;
}
