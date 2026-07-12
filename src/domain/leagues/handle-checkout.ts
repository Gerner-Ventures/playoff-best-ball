import { Prisma, type PrismaClient } from "@prisma/client";
import { upgradeLeaguePremium } from "./upgrade-league";

export interface CheckoutCompletedInput {
  sessionId: string;
  leagueId: string;
  userId: string;
  amountCents: number;
}

/**
 * Source of truth for premium: called by the Stripe webhook. Idempotent by
 * stripeSessionId (Stripe retries webhooks); purchase + upgrade are atomic.
 */
export async function handleCheckoutCompleted(db: PrismaClient, input: CheckoutCompletedInput) {
  if (!input.leagueId) throw new Error("checkout session missing leagueId metadata");
  const existing = await db.leaguePurchase.findUnique({
    where: { stripeSessionId: input.sessionId },
  });
  if (existing) return existing;

  // Warn before entering the transaction if the league is already premium — this
  // session is a new (different) charge and is a refund candidate.
  const league = await db.league.findUniqueOrThrow({ where: { id: input.leagueId } });
  if (league.tier === "PREMIUM") {
    console.error(
      `[stripe] duplicate premium purchase for league ${input.leagueId} (session ${input.sessionId}) — refund candidate`,
    );
  }

  try {
    return await db.$transaction(async (tx) => {
      const purchase = await tx.leaguePurchase.create({
        data: {
          leagueId: input.leagueId,
          purchasedById: input.userId,
          stripeSessionId: input.sessionId,
          amountCents: input.amountCents,
        },
      });
      await upgradeLeaguePremium(tx, { leagueId: input.leagueId });
      return purchase;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Stripe double-delivers; the unique constraint arbitrates — loser returns the winner's row.
      const winner = await db.leaguePurchase.findUnique({
        where: { stripeSessionId: input.sessionId },
      });
      if (winner) return winner;
    }
    throw err;
  }
}
