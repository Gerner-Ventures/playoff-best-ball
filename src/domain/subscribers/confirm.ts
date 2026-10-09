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
  // Conditional on PENDING *and* this token's hash: of two concurrent clicks, exactly one wins.
  // Binding to the hash also means a concurrent unsubscribe, or a new signup that rotates the
  // hash, makes this write match nothing — so a raced or stale link can never report "confirmed"
  // for a row it no longer describes. Clearing unsubscribedAt too: a confirm click re-proves
  // consent, so a row that was once UNSUBSCRIBED and then resubmitted through the form must not
  // carry that stale flag onto this freshly-reconfirmed ACTIVE row.
  const { count } = await db.emailSubscriber.updateMany({
    where: { id: row.id, status: "PENDING", confirmTokenHash: hashToken(input.token) },
    data: { status: "ACTIVE", confirmedAt: input.now, unsubscribedAt: null },
  });
  if (count === 1) return { result: "confirmed", subscriberId: row.id, source: row.source };
  // Lost the race (or never qualified): re-read to report what's actually true now, rather than
  // assuming the only way to lose is "someone else already confirmed".
  const current = await db.emailSubscriber.findUnique({ where: { id: row.id } });
  return current?.status === "ACTIVE" ? { result: "already_confirmed" } : { result: "invalid" };
}
