import type { PrismaClient } from "@prisma/client";
import { isWellFormedToken } from "./tokens";

export type UnsubscribeResult =
  | { result: "unsubscribed"; subscriberId: string }
  | { result: "already_unsubscribed" }
  | { result: "invalid" };

/** Shared by the unsubscribe page's button and RFC 8058 one-click (spec §5.4). Repeats are harmless. */
export async function unsubscribeByToken(
  db: PrismaClient,
  input: { token: unknown; now: Date },
): Promise<UnsubscribeResult> {
  if (!isWellFormedToken(input.token)) return { result: "invalid" };
  const row = await db.emailSubscriber.findUnique({ where: { unsubscribeToken: input.token } });
  if (!row) return { result: "invalid" };
  const { count } = await db.emailSubscriber.updateMany({
    where: { id: row.id, status: { not: "UNSUBSCRIBED" } },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: input.now },
  });
  return count === 1 ? { result: "unsubscribed", subscriberId: row.id } : { result: "already_unsubscribed" };
}

export type ResubscribeResult =
  | { result: "resubscribed"; subscriberId: string }
  | { result: "already_active" }
  | { result: "invalid" };

/**
 * Undo for a mis-clicked unsubscribe. It goes straight back to ACTIVE with no
 * re-confirmation: the unsubscribe token was only ever sent to this inbox, so
 * holding it proves control of the address. Only ever a valid transition from
 * UNSUBSCRIBED — a PENDING row (whose confirm link may be long expired) is not
 * silently activated by this token, and a concurrent confirm can't be clobbered.
 */
export async function resubscribeByToken(
  db: PrismaClient,
  input: { token: unknown; now: Date },
): Promise<ResubscribeResult> {
  if (!isWellFormedToken(input.token)) return { result: "invalid" };
  const row = await db.emailSubscriber.findUnique({ where: { unsubscribeToken: input.token } });
  if (!row) return { result: "invalid" };
  // Conditional on UNSUBSCRIBED: of two concurrent clicks, exactly one wins.
  const { count } = await db.emailSubscriber.updateMany({
    where: { id: row.id, status: "UNSUBSCRIBED" },
    data: { status: "ACTIVE", unsubscribedAt: null, confirmedAt: row.confirmedAt ?? input.now },
  });
  if (count === 1) return { result: "resubscribed", subscriberId: row.id };
  // Lost the race (or never qualified): re-read to report what's actually true now.
  const current = await db.emailSubscriber.findUnique({ where: { id: row.id } });
  return current?.status === "ACTIVE" ? { result: "already_active" } : { result: "invalid" };
}
