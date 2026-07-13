import type { PrismaClient } from "@prisma/client";
import {
  DraftAlreadyStartedError,
  LeagueFullError,
  NotLeagueMemberError,
  PremiumFeatureError,
} from "../errors";
import { parseLeagueSettings } from "../league-settings";

export interface AddEntryInput {
  leagueId: string;
  userId: string;
  teamName: string;
}

/** Premium perk: one person, multiple teams. Same cap and draft-lock as joining. */
export async function addEntry(db: PrismaClient, input: AddEntryInput) {
  const league = await db.league.findUniqueOrThrow({
    where: { id: input.leagueId },
    include: { draft: { select: { id: true } } },
  });
  if (league.tier !== "PREMIUM") throw new PremiumFeatureError("Multiple entries per person");
  // Extra entries created after the draft exists would not appear in the snake order.
  if (league.draft) throw new DraftAlreadyStartedError();

  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
  });
  if (!membership) throw new NotLeagueMemberError();

  const settings = parseLeagueSettings(league.settings);
  // Transaction re-count narrows the add-rush race window, mirroring joinLeague (a hard
  // guarantee would need a DB constraint).
  return db.$transaction(async (tx) => {
    const count = await tx.entry.count({ where: { leagueId: input.leagueId } });
    if (count >= settings.maxEntries) throw new LeagueFullError(settings.maxEntries);
    return tx.entry.create({
      data: { leagueId: input.leagueId, membershipId: membership.id, name: input.teamName },
    });
  });
}
