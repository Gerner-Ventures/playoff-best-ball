import { Prisma, type EmailSubscriber, type PrismaClient } from "@prisma/client";
import { ACCOUNT_SOURCE } from "./sources";
import { newToken, normalizeEmail } from "./tokens";

type AccountUser = { id: string; email: string };

/**
 * The account holder's list row, creating or linking it (spec §5.5). Account holders
 * are on the digest by default, but an earlier unsubscribe is always respected.
 * Returns null only when the address belongs to a different account; that row is
 * left alone.
 */
export async function ensureAccountSubscriber(
  db: PrismaClient,
  user: AccountUser,
  now: Date = new Date(),
): Promise<EmailSubscriber | null> {
  const linked = await db.emailSubscriber.findUnique({ where: { userId: user.id } });
  if (linked) return linked;

  const email = normalizeEmail(user.email);
  const byEmail = await db.emailSubscriber.findUnique({ where: { email } });
  if (byEmail) {
    if (byEmail.userId && byEmail.userId !== user.id) return null;
    // Conditional writes: a concurrent unsubscribe (or confirm) between this read and
    // these writes must not be clobbered. Link only if still unlinked, and only flip
    // PENDING -> ACTIVE if the row is still PENDING at write time (signing in proves
    // the address, so no confirm click is needed) — then re-read to report the truth.
    await db.emailSubscriber.updateMany({
      where: { id: byEmail.id, userId: null },
      data: { userId: user.id },
    });
    await db.emailSubscriber.updateMany({
      where: { id: byEmail.id, status: "PENDING" },
      data: { status: "ACTIVE", confirmedAt: now },
    });
    const current = await db.emailSubscriber.findUnique({ where: { id: byEmail.id } });
    if (!current || current.userId !== user.id) return null;
    return current;
  }

  try {
    return await db.emailSubscriber.create({
      data: { email, userId: user.id, source: ACCOUNT_SOURCE, status: "ACTIVE", confirmedAt: now, unsubscribeToken: newToken() },
    });
  } catch (err) {
    // The create-user hook and a settings-page load can race; the second sees the first's row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return ensureAccountSubscriber(db, user, now);
    }
    throw err;
  }
}

export async function getDigestPreference(db: PrismaClient, user: AccountUser): Promise<boolean> {
  const row = await ensureAccountSubscriber(db, user);
  return row?.status === "ACTIVE";
}

export async function setDigestPreference(
  db: PrismaClient,
  user: AccountUser,
  enabled: boolean,
  now: Date = new Date(),
): Promise<boolean> {
  const row = await ensureAccountSubscriber(db, user, now);
  if (!row) return false;
  const updated = await db.emailSubscriber.update({
    where: { id: row.id },
    data: enabled
      ? { status: "ACTIVE", unsubscribedAt: null, confirmedAt: row.confirmedAt ?? now }
      : { status: "UNSUBSCRIBED", unsubscribedAt: now },
  });
  return updated.status === "ACTIVE";
}
