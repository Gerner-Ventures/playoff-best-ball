import type { PrismaClient } from "@prisma/client";
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

  return db.$transaction(async (tx) => {
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
}
