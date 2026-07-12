import webpush from "web-push";
import type { PrismaClient } from "@prisma/client";
import { smsBodyFor, type Notification, type NotifyRecipient } from "./notify";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const configured = Boolean(publicKey && privateKey);
if (configured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:hello@playoffbestball.com",
    publicKey!,
    privateKey!,
  );
}

/** 404/410 mean the browser subscription is gone for good — delete the row. */
export function isDeadSubscriptionStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

/**
 * Best-effort: sends to every subscription, prunes dead ones, logs other failures.
 * Never throws for individual sends — push is an enhancement, not the system of record
 * (email is). Throws only on missing config in production while subscriptions exist.
 */
export async function sendPushNotification(
  db: PrismaClient,
  recipient: NotifyRecipient,
  n: Notification,
): Promise<void> {
  if (recipient.pushSubscriptions.length === 0) return;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("VAPID keys are not set but push subscriptions exist");
    }
    console.log(`[dev] push ${recipient.email}: ${n.subject}`);
    return;
  }
  const payload = JSON.stringify({ title: n.subject, body: smsBodyFor(n), url: n.url ?? "/" });
  for (const sub of recipient.pushSubscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (isDeadSubscriptionStatus(statusCode)) {
        await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        console.error(`push to ${recipient.email} (${sub.id}) failed:`, err);
      }
    }
  }
}
