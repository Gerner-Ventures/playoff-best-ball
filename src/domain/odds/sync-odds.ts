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

  // Week/team pairings can shift between syncs (reschedules; next-round matchups
  // firming up). Rows written under an old mapping would otherwise linger and be
  // read as authoritative, so wipe odds for every active (non-FINAL) week and
  // rewrite them fresh. Past all-FINAL weeks are untouched history.
  const activeWeeks = [...new Set(scheduled.map((g) => g.week))];
  await db.teamOdds.deleteMany({
    where: { season: input.season, week: { in: activeWeeks } },
  });
  let upserted = 0;
  for (const o of odds) {
    const game =
      gameByPair.get(`${o.homeTeam}:${o.awayTeam}`) ?? gameByPair.get(`${o.awayTeam}:${o.homeTeam}`);
    if (!game) continue;
    const rows = [
      { team: o.homeTeam, opponent: o.awayTeam, winProb: o.homeWinProb, moneyline: o.homeMoneyline },
      { team: o.awayTeam, opponent: o.homeTeam, winProb: o.awayWinProb, moneyline: o.awayMoneyline },
    ];
    for (const row of rows) {
      await db.teamOdds.upsert({
        where: { season_week_team: { season: input.season, week: game.week, team: row.team } },
        create: { season: input.season, week: game.week, eventTime: o.commenceTime, ...row },
        update: { winProb: row.winProb, moneyline: row.moneyline, opponent: row.opponent, eventTime: o.commenceTime },
      });
      upserted += 1;
    }
  }
  return { upserted };
}
