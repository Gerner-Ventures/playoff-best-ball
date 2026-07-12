import type { PrismaClient } from "@prisma/client";
import { sendEmailNotification } from "./notify-email";
import { sendSmsNotification } from "./notify-sms";
import { sendPushNotification } from "./notify-push";

export type NotificationChannel = "email" | "sms" | "push";

export interface Notification {
  subject: string;
  text: string;
  /** Short form for SMS/push bodies; falls back to subject (+ url). */
  smsText?: string;
  /** Deep link opened from push notifications and appended to SMS fallback. */
  url?: string;
}

export interface NotifyRecipient {
  userId: string;
  email: string;
  name: string;
  phone: string | null;
  smsOptIn: boolean;
  pushSubscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[];
}

/** Which channels apply to a recipient. Email is the baseline; the rest are opt-in. */
export function channelsFor(
  r: Pick<NotifyRecipient, "phone" | "smsOptIn" | "pushSubscriptions">,
): NotificationChannel[] {
  const channels: NotificationChannel[] = ["email"];
  if (r.phone && r.smsOptIn) channels.push("sms");
  if (r.pushSubscriptions.length > 0) channels.push("push");
  return channels;
}

export function smsBodyFor(n: Pick<Notification, "subject" | "text" | "smsText" | "url">): string {
  return n.smsText ?? (n.url ? `${n.subject} ${n.url}` : n.subject);
}

/** Everything the channel senders need about a user, in one query. */
export async function loadRecipient(db: PrismaClient, userId: string): Promise<NotifyRecipient> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, phone: true, smsOptIn: true,
      pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
    },
  });
  const { id, ...rest } = user;
  return { userId: id, ...rest };
}

/**
 * Sends on ONE channel. Email/SMS throw on failure (call each channel from its own
 * Inngest step so retries are per-channel and idempotent). Push is best-effort inside
 * (per-subscription failures are pruned/logged, never thrown).
 */
export async function notifyVia(
  db: PrismaClient,
  channel: NotificationChannel,
  recipient: NotifyRecipient,
  notification: Notification,
): Promise<void> {
  switch (channel) {
    case "email":
      return sendEmailNotification(recipient, notification);
    case "sms":
      return sendSmsNotification(recipient, notification);
    case "push":
      return sendPushNotification(db, recipient, notification);
  }
}

/** @deprecated Task-3 migration target: use loadRecipient + channelsFor + notifyVia. */
export async function notifyUser(
  user: { email: string; name: string },
  notification: Notification,
): Promise<void> {
  return sendEmailNotification(user, notification);
}
