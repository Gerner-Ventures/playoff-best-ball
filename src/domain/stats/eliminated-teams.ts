import type { PrismaClient } from "@prisma/client";

/**
 * Derived, never stored: every playoff game is an elimination game, so the
 * eliminated set is exactly the losers of FINAL games this season.
 */
export async function getEliminatedTeams(db: PrismaClient, season: number): Promise<Set<string>> {
  const finals = await db.nflGame.findMany({
    where: { season, state: "FINAL" },
    select: { homeTeam: true, awayTeam: true, homeScore: true, awayScore: true },
  });
  const eliminated = new Set<string>();
  for (const g of finals) {
    if (g.homeScore === g.awayScore) continue; // impossible in the playoffs; be safe
    eliminated.add(g.homeScore > g.awayScore ? g.awayTeam : g.homeTeam);
  }
  return eliminated;
}
