import type { PrismaClient } from "@prisma/client";
import type { OddsProvider } from "./provider";

/**
 * Match provider odds to OUR scheduled games (by team pair) and store one row per
 * team per week. Games we don't recognize (other weeks, typos) are skipped.
 */
export async function syncTeamOdds(
  db: PrismaClient,
  provider: OddsProvider,
  input: { season: number },
) {
  const scheduled = await db.nflGame.findMany({
    where: { season: input.season, state: { not: "FINAL" } },
    select: { week: true, homeTeam: true, awayTeam: true },
  });
  if (scheduled.length === 0) return { upserted: 0 };
  const gameByPair = new Map(scheduled.map((g) => [`${g.homeTeam}:${g.awayTeam}`, g]));

  const odds = await provider.fetchUpcomingOdds();

  // First pass: match provider odds to our scheduled games and build every row
  // payload before touching the DB, noting which weeks got fresh data.
  const pending: {
    week: number;
    eventTime: Date;
    team: string;
    opponent: string;
    winProb: number;
    moneyline: number | null;
  }[] = [];
  for (const o of odds) {
    const game =
      gameByPair.get(`${o.homeTeam}:${o.awayTeam}`) ?? gameByPair.get(`${o.awayTeam}:${o.homeTeam}`);
    if (!game) continue;
    pending.push(
      { week: game.week, eventTime: o.commenceTime, team: o.homeTeam, opponent: o.awayTeam, winProb: o.homeWinProb, moneyline: o.homeMoneyline },
      { week: game.week, eventTime: o.commenceTime, team: o.awayTeam, opponent: o.homeTeam, winProb: o.awayWinProb, moneyline: o.awayMoneyline },
    );
  }

  // An empty or fully-unmatched feed must never destroy existing odds: The Odds
  // API legitimately returns an empty upcoming feed once games commence, and
  // that is not a signal that the current board is wrong.
  if (pending.length === 0) return { upserted: 0 };

  // Week/team pairings can shift between syncs (reschedules; next-round matchups
  // firming up). Rows written under an old mapping would otherwise linger and be
  // read as authoritative, so wipe and fully rewrite each week that has fresh
  // matched data. Weeks with no fresh data keep their existing rows, and past
  // all-FINAL weeks are untouched history.
  const refreshWeeks = [...new Set(pending.map((r) => r.week))];
  await db.teamOdds.deleteMany({
    where: { season: input.season, week: { in: refreshWeeks } },
  });
  let upserted = 0;
  for (const row of pending) {
    const { week, eventTime, ...rest } = row;
    await db.teamOdds.upsert({
      where: { season_week_team: { season: input.season, week, team: row.team } },
      create: { season: input.season, week, eventTime, ...rest },
      update: { winProb: row.winProb, moneyline: row.moneyline, opponent: row.opponent, eventTime },
    });
    upserted += 1;
  }
  return { upserted };
}
