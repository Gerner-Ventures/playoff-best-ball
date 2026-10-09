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
    await sendOrRollBack(db, sender, urls, created, token, null, "PENDING");
    return { outcome: "sent", subscriberId: created.id };
  }

  if (existing.status === "ACTIVE") return { outcome: "already_active", subscriberId: existing.id };

  // PENDING (an old or lost link) or UNSUBSCRIBED (consent must be re-proven): new token, back to
  // PENDING. The `existing` read above is stale by the time we write, so eligibility is re-checked
  // atomically in the WHERE of this updateMany, not from the value we already have in hand:
  //   - `status: { not: "ACTIVE" }` so a confirm landing in the gap between our read and this write
  //     is never demoted back to PENDING.
  //   - the `OR` reproduces the throttle check (unsent, or sent before the cutoff) against the
  //     row's *current* confirmSentAt, so two concurrent resends for the same row serialize at the
  //     database: the loser's predicate no longer matches once the winner's write lands, and it
  //     updates zero rows instead of rotating a second token no one will get.
  const token = newToken();
  const previousSentAt = existing.confirmSentAt;
  const previousStatus = existing.status;
  const throttleCutoff = new Date(input.now.getTime() - RESEND_THROTTLE_MS);
  const { count } = await db.emailSubscriber.updateMany({
    where: {
      id: existing.id,
      status: { not: "ACTIVE" },
      OR: [{ confirmSentAt: null }, { confirmSentAt: { lte: throttleCutoff } }],
    },
    data: { status: "PENDING", confirmTokenHash: hashToken(token), confirmSentAt: input.now },
  });

  if (count === 0) {
    // We lost the race above (or never qualified); re-read to report what's actually true now.
    const current = await db.emailSubscriber.findUniqueOrThrow({ where: { id: existing.id } });
    return {
      outcome: current.status === "ACTIVE" ? "already_active" : "throttled",
      subscriberId: current.id,
    };
  }

  // email and unsubscribeToken are immutable, so `existing` (read before the write) is still
  // correct to send from.
  await sendOrRollBack(db, sender, urls, existing, token, previousSentAt, previousStatus);
  return { outcome: "sent", subscriberId: existing.id };
}

async function sendOrRollBack(
  db: PrismaClient,
  sender: MarketingSender,
  urls: SubscriberUrls,
  row: EmailSubscriber,
  token: string,
  previousSentAt: Date | null,
  previousStatus: EmailSubscriber["status"],
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
    // Scoped to *this* request's own token: if a concurrent resend for the same row already
    // rotated confirmTokenHash again (e.g. its own send succeeded), that newer stamp belongs to
    // mail that did go out, and this rollback must not clobber it. Also restores the row's
    // previous status: a failed resend of a once-UNSUBSCRIBED row must leave it UNSUBSCRIBED,
    // not stranded in PENDING with unsubscribedAt still set (which would let a later signup or
    // confirm resubscribe it without re-proving consent). Also scoped to `status: "PENDING"`:
    // this request is the one that put the row into PENDING, so that's the only state it's
    // entitled to undo. Other writers (the sign-up hook, unsubscribeByToken, setDigestPreference)
    // never touch confirmTokenHash, so without this guard a status change that lands while the
    // send is in flight would otherwise be overwritten by this rollback even though it's not the
    // change this rollback is undoing.
    try {
      await db.emailSubscriber.updateMany({
        where: { id: row.id, status: "PENDING", confirmTokenHash: hashToken(token) },
        data: { confirmSentAt: previousSentAt, status: previousStatus },
      });
    } catch (rollbackErr) {
      // The send already failed; a DB hiccup on the rollback must not hide that from the caller.
      console.error("failed to roll back confirmSentAt after a failed confirmation send", rollbackErr);
    }
    throw new ConfirmationEmailFailedError(err);
  }
}
