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

/**
 * Weeks whose games are ALL final (and exist), per league above its watermark.
 *
 * Emits at most ONE week per league — the lowest pending week — so two recap
 * events for the same league are never in flight at once. Concurrent runs would
 * race on the watermark claim (`lastRecapWeek < week`) and the lower week's
 * recap would be silently dropped. If a league is multiple weeks behind, the
 * hourly cron catches it up one week per tick.
 */
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

  const sortedWeeks = [...finishedWeeks].sort((a, b) => a - b);
  const leagues = await leaguesWithCompleteDrafts(db);
  const due: DueWork[] = [];
  for (const league of leagues) {
    const week = sortedWeeks.find((w) => w > league.lastRecapWeek);
    if (week !== undefined) due.push({ leagueId: league.id, week });
  }
  return due;
}

/**
 * Weeks with games starting within the horizon, per league above its watermark.
 *
 * Like findDueRecaps, emits at most ONE week per league (the lowest pending
 * week) so concurrent preview runs never race on the watermark claim; the
 * cron catches up one week per tick.
 */
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
    const week = dueWeeks.find((w) => w > league.lastPreviewWeek);
    if (week !== undefined) due.push({ leagueId: league.id, week });
  }
  return due;
}
