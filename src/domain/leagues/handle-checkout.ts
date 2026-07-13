import { Prisma, type PrismaClient, type LeaguePurchase } from "@prisma/client";
import { upgradeLeaguePremium } from "./upgrade-league";

export interface CheckoutCompletedInput {
  sessionId: string;
  leagueId: string;
  userId: string;
  amountCents: number;
}

export interface CheckoutCompletedResult {
  purchase: LeaguePurchase;
  /**
   * True only when THIS call created the purchase row. Idempotent replays
   * (already-processed session, P2002 race loser) return created=false so
   * callers can gate one-time side effects (e.g. analytics) on it.
   */
  created: boolean;
}

/**
 * Source of truth for premium: called by the Stripe webhook. Idempotent by
 * stripeSessionId (Stripe retries webhooks); purchase + upgrade are atomic.
 * Returns null (no throw) for unknown leagueIds so Stripe does not retry-loop.
 */
export async function handleCheckoutCompleted(
  db: PrismaClient,
  input: CheckoutCompletedInput,
): Promise<CheckoutCompletedResult | null> {
  if (!input.leagueId) throw new Error("checkout session missing leagueId metadata");
  const existing = await db.leaguePurchase.findUnique({
    where: { stripeSessionId: input.sessionId },
  });
  if (existing) return { purchase: existing, created: false };

  // Single league fetch: covers both the nonexistent-league early-return and the
  // duplicate-premium warning; avoids a second DB round-trip inside the transaction.
  const league = await db.league.findUnique({ where: { id: input.leagueId } });
  if (!league) {
    console.error(
      `[stripe] purchase for unknown league ${input.leagueId} (session ${input.sessionId}) — refund candidate; not retrying`,
    );
    return null;
  }
  if (league.tier === "PREMIUM") {
    // This session is a new (different) charge and is a refund candidate.
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
      return { purchase, created: true };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Stripe double-delivers; the unique constraint arbitrates — the loser returns
      // the winner's row with created=false (it did not create the purchase).
      const winner = await db.leaguePurchase.findUnique({
        where: { stripeSessionId: input.sessionId },
      });
      if (winner) return { purchase: winner, created: false };
    }
    throw err;
  }
}
