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
 * holding it proves control of the address.
 */
export async function resubscribeByToken(
  db: PrismaClient,
  input: { token: unknown; now: Date },
): Promise<ResubscribeResult> {
  if (!isWellFormedToken(input.token)) return { result: "invalid" };
  const row = await db.emailSubscriber.findUnique({ where: { unsubscribeToken: input.token } });
  if (!row) return { result: "invalid" };
  if (row.status === "ACTIVE") return { result: "already_active" };
  await db.emailSubscriber.update({
    where: { id: row.id },
    data: { status: "ACTIVE", unsubscribedAt: null, confirmedAt: row.confirmedAt ?? input.now },
  });
  return { result: "resubscribed", subscriberId: row.id };
}
