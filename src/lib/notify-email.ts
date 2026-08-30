import { Resend } from "resend";
import type { Notification, NotifyRecipient } from "./notify";
import { DEMO_MODE_REQUESTED } from "./demo-mode";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendEmailNotification(
  recipient: Pick<NotifyRecipient, "email" | "name">,
  n: Notification,
): Promise<void> {
  if (!resend) {
    // The demo deliberately runs with production NODE_ENV and no outbound keys, so
    // notifications must log rather than throw there. Real production still fails loudly.
    if (process.env.NODE_ENV === "production" && !DEMO_MODE_REQUESTED) {
      throw new Error("RESEND_API_KEY is not set; cannot send notifications");
    }
    console.log(`[dev] email ${recipient.email}: ${n.subject} — ${n.text}`);
    return;
  }
  const { error } = await resend.emails.send({
    from:
      process.env.NOTIFY_FROM_EMAIL ||
      "Playoff Best Ball <notify@transactional.playoffbestball.com>",
    to: recipient.email,
    subject: n.subject,
    text: n.text,
  });
  if (error) {
    throw new Error(`notification email to ${recipient.email} failed: ${error.name}: ${error.message}`);
  }
}
