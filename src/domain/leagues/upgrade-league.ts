import { Prisma, type PrismaClient } from "@prisma/client";
import { parseLeagueSettings } from "../league-settings";

export const PREMIUM_MAX_ENTRIES = 25;

type Db = PrismaClient | Prisma.TransactionClient;

/** Idempotent premium flip: tier + entry-cap raise. Callable inside the webhook transaction. */
export async function upgradeLeaguePremium(db: Db, input: { leagueId: string }) {
  const league = await db.league.findUniqueOrThrow({ where: { id: input.leagueId } });
  if (league.tier === "PREMIUM") return league;
  const settings = parseLeagueSettings(league.settings);
  settings.maxEntries = Math.max(settings.maxEntries, PREMIUM_MAX_ENTRIES);
  return db.league.update({
    where: { id: input.leagueId },
    data: { tier: "PREMIUM", settings: settings as Prisma.InputJsonValue },
  });
}
