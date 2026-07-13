import { Prisma, type PrismaClient } from "@prisma/client";
import { NotCommissionerError, NotLeagueMemberError } from "../errors";

async function requireCommissioner(db: PrismaClient, leagueId: string, userId: string) {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  if (!membership || membership.role !== "COMMISSIONER") throw new NotCommissionerError();
}

export async function setDuesPaid(
  db: PrismaClient,
  input: { leagueId: string; userId: string; entryId: string; paid: boolean },
) {
  await requireCommissioner(db, input.leagueId, input.userId);
  const entry = await db.entry.findUnique({ where: { id: input.entryId } });
  if (!entry || entry.leagueId !== input.leagueId) throw new Error("entry not in league");
  return db.entry.update({ where: { id: input.entryId }, data: { duesPaid: input.paid } });
}

/**
 * Fake-door signal: which members want us to collect dues next season.
 * Idempotent per (league, user); reports re-clicks so callers can fire
 * analytics only on first-time records. Any member may register interest
 * (the v1 UI only surfaces it on the commissioner-only settings page).
 */
export async function recordDuesInterest(
  db: PrismaClient,
  input: { leagueId: string; userId: string },
): Promise<{ alreadyRecorded: boolean }> {
  const membership = await db.membership.findUnique({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
  });
  if (!membership) throw new NotLeagueMemberError();

  try {
    await db.duesCollectionInterest.create({
      data: { leagueId: input.leagueId, userId: input.userId },
    });
    return { alreadyRecorded: false };
  } catch (err) {
    // Two concurrent first-clicks (double-click, multi-tab) race to insert; the loser gets a
    // P2002 unique violation, which is the idempotent "already recorded" case, not an error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { alreadyRecorded: true };
    }
    throw err;
  }
}
