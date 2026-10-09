import { Prisma, type EmailSubscriber, type PrismaClient } from "@prisma/client";
import { buildConfirmationEmail } from "./confirmation-email";
import type { MarketingSender, SubscriberUrls } from "./sender";
import type { SubscribeSource } from "./sources";
import { hashToken, newToken, normalizeEmail } from "./tokens";

/** At most one confirmation email per address per window, so the form can't flood a stranger's inbox. */
export const RESEND_THROTTLE_MS = 10 * 60 * 1000;

export type SubscribeOutcome = "sent" | "throttled" | "already_active";

export class ConfirmationEmailFailedError extends Error {
  constructor(cause: unknown) {
    super("confirmation email failed to send", { cause });
    this.name = "ConfirmationEmailFailedError";
  }
}

/**
 * Form signup (spec §5.2). The caller must not reveal the outcome to the visitor:
 * all three outcomes look the same from outside.
 */
export async function requestSubscription(
  db: PrismaClient,
  sender: MarketingSender,
  urls: SubscriberUrls,
  input: { email: string; source: SubscribeSource; now: Date },
): Promise<{ outcome: SubscribeOutcome; subscriberId: string }> {
  const email = normalizeEmail(input.email);
  const existing = await db.emailSubscriber.findUnique({ where: { email } });

  if (!existing) {
    const token = newToken();
    let created: EmailSubscriber;
    try {
      created = await db.emailSubscriber.create({
        data: {
          email,
          source: input.source,
          status: "PENDING",
          confirmTokenHash: hashToken(token),
          confirmSentAt: input.now,
          unsubscribeToken: newToken(),
        },
      });
    } catch (err) {
      // Two first signups for one address race; the loser treats the winner's row as existing.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return requestSubscription(db, sender, urls, input);
      }
      throw err;
    }
    await sendOrRollBack(db, sender, urls, created, token, null);
    return { outcome: "sent", subscriberId: created.id };
  }

  if (existing.status === "ACTIVE") return { outcome: "already_active", subscriberId: existing.id };

  if (existing.confirmSentAt && input.now.getTime() - existing.confirmSentAt.getTime() < RESEND_THROTTLE_MS) {
    return { outcome: "throttled", subscriberId: existing.id };
  }

  // PENDING (an old or lost link) or UNSUBSCRIBED (consent must be re-proven): new token, back to PENDING.
  const token = newToken();
  const previousSentAt = existing.confirmSentAt;
  const updated = await db.emailSubscriber.update({
    where: { id: existing.id },
    data: { status: "PENDING", confirmTokenHash: hashToken(token), confirmSentAt: input.now },
  });
  await sendOrRollBack(db, sender, urls, updated, token, previousSentAt);
  return { outcome: "sent", subscriberId: updated.id };
}

async function sendOrRollBack(
  db: PrismaClient,
  sender: MarketingSender,
  urls: SubscriberUrls,
  row: EmailSubscriber,
  token: string,
  previousSentAt: Date | null,
): Promise<void> {
  try {
    await sender.send(
      buildConfirmationEmail({
        to: row.email,
        confirmUrl: urls.confirm(token),
        unsubscribePageUrl: urls.unsubscribePage(row.unsubscribeToken),
        oneClickUnsubscribeUrl: urls.oneClickUnsubscribe(row.unsubscribeToken),
      }),
    );
  } catch (err) {
    // Un-stamp the send, so the throttle doesn't block an immediate retry of mail that never left.
    await db.emailSubscriber.update({ where: { id: row.id }, data: { confirmSentAt: previousSentAt } });
    throw new ConfirmationEmailFailedError(err);
  }
}
