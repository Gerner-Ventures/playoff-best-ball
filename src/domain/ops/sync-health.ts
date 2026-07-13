import type { PrismaClient } from "@prisma/client";

export const ALERT_THRESHOLD = 3; // spec §7: alert after N consecutive provider failures

export interface SyncOutcomeResult {
  consecutiveFailures: number;
  shouldAlert: boolean; // exactly once per failure streak, at the threshold
  recovered: boolean; // success after an alerted streak
}

/** Upsert-style consecutive-failure counter. Alert once per streak; announce recovery once. */
export async function recordSyncOutcome(
  db: PrismaClient,
  input: { job: string; ok: boolean; error?: string },
): Promise<SyncOutcomeResult> {
  const now = new Date();
  const existing = await db.syncHealth.findUnique({ where: { job: input.job } });

  if (input.ok) {
    const recovered = existing?.alertedAt != null;
    await db.syncHealth.upsert({
      where: { job: input.job },
      create: { job: input.job, lastSuccessAt: now },
      update: { consecutiveFailures: 0, alertedAt: null, lastSuccessAt: now, lastError: null },
    });
    return { consecutiveFailures: 0, shouldAlert: false, recovered };
  }

  const failures = (existing?.consecutiveFailures ?? 0) + 1;
  const shouldAlert = failures >= ALERT_THRESHOLD && existing?.alertedAt == null;
  await db.syncHealth.upsert({
    where: { job: input.job },
    create: {
      job: input.job,
      consecutiveFailures: failures,
      lastError: input.error ?? null,
      lastFailureAt: now,
      alertedAt: shouldAlert ? now : null,
    },
    update: {
      consecutiveFailures: failures,
      lastError: input.error ?? null,
      lastFailureAt: now,
      ...(shouldAlert ? { alertedAt: now } : {}),
    },
  });
  return { consecutiveFailures: failures, shouldAlert, recovered: false };
}
