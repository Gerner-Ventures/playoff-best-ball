import type { PrismaClient } from "@prisma/client";
import { NotCommissionerError } from "../errors";

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

/** Fake-door signal: which commissioners want us to collect dues. Idempotent. */
export async function recordDuesInterest(
  db: PrismaClient,
  input: { leagueId: string; userId: string },
) {
  await requireCommissioner(db, input.leagueId, input.userId);
  return db.duesCollectionInterest.upsert({
    where: { leagueId_userId: { leagueId: input.leagueId, userId: input.userId } },
    create: { leagueId: input.leagueId, userId: input.userId },
    update: {},
  });
}
