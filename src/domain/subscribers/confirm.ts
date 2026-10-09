import type { PrismaClient } from "@prisma/client";
import { hashToken, isWellFormedToken } from "./tokens";

export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ConfirmResult =
  | { result: "confirmed"; subscriberId: string; source: string }
  | { result: "already_confirmed" }
  | { result: "expired" }
  | { result: "invalid" };

/**
 * Confirm button POST (spec §5.3). The hash is deliberately kept after confirming
 * (see the plan's spec clarifications), so a re-click or a double-click lands on
 * "you're on the list". Only a PENDING row can be confirmed, so an old link never
 * reactivates an UNSUBSCRIBED one.
 */
export async function confirmSubscription(
  db: PrismaClient,
  input: { token: unknown; now: Date },
): Promise<ConfirmResult> {
  if (!isWellFormedToken(input.token)) return { result: "invalid" };
  const row = await db.emailSubscriber.findUnique({ where: { confirmTokenHash: hashToken(input.token) } });
  if (!row) return { result: "invalid" };
  if (row.status === "ACTIVE") return { result: "already_confirmed" };
  if (row.status === "UNSUBSCRIBED") return { result: "invalid" };
  if (!row.confirmSentAt || input.now.getTime() - row.confirmSentAt.getTime() > CONFIRM_TTL_MS) {
    return { result: "expired" };
  }
  // Conditional on PENDING: of two concurrent clicks, exactly one wins.
  const { count } = await db.emailSubscriber.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { status: "ACTIVE", confirmedAt: input.now },
  });
  return count === 1 ? { result: "confirmed", subscriberId: row.id, source: row.source } : { result: "already_confirmed" };
}
