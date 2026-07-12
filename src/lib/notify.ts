import { Resend } from "resend";

// Channel abstraction: Phase 2 ships email only. Phase 2.5 adds SMS (Twilio) and
// Web Push behind this same function, dispatching on user notification preferences.

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface Notification {
  subject: string;
  text: string;
}

/**
 * Best-effort user notification. Throws on send failure so callers running inside
 * Inngest steps get retries; callers on request paths must catch — notifications
 * never block a pick.
 */
export async function notifyUser(
  user: { email: string; name: string },
  notification: Notification,
): Promise<void> {
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set; cannot send notifications");
    }
    console.log(`[dev] notify ${user.email}: ${notification.subject} — ${notification.text}`);
    return;
  }
  const { error } = await resend.emails.send({
    from:
      process.env.NOTIFY_FROM_EMAIL ??
      "Playoff Best Ball <notify@transactional.playoffbestball.com>",
    to: user.email,
    subject: notification.subject,
    text: notification.text,
  });
  if (error) {
    throw new Error(`notification email to ${user.email} failed: ${error.name}: ${error.message}`);
  }
}
