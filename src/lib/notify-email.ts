import { Resend } from "resend";
import type { Notification, NotifyRecipient } from "./notify";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendEmailNotification(
  recipient: Pick<NotifyRecipient, "email" | "name">,
  n: Notification,
): Promise<void> {
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set; cannot send notifications");
    }
    console.log(`[dev] email ${recipient.email}: ${n.subject} — ${n.text}`);
    return;
  }
  const { error } = await resend.emails.send({
    from:
      process.env.NOTIFY_FROM_EMAIL ??
      "Playoff Best Ball <notify@transactional.playoffbestball.com>",
    to: recipient.email,
    subject: n.subject,
    text: n.text,
  });
  if (error) {
    throw new Error(`notification email to ${recipient.email} failed: ${error.name}: ${error.message}`);
  }
}
