import twilio from "twilio";
import { smsBodyFor, type Notification, type NotifyRecipient } from "./notify";

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM_NUMBER;
const client = sid && token ? twilio(sid, token) : null;

export async function sendSmsNotification(
  recipient: Pick<NotifyRecipient, "phone">,
  n: Notification,
): Promise<void> {
  if (!recipient.phone) throw new Error("sendSmsNotification called without a phone number");
  const body = smsBodyFor(n);
  if (!client || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Twilio env (TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER) is not set");
    }
    console.log(`[dev] sms ${recipient.phone}: ${body}`);
    return;
  }
  // Twilio throws on API errors — exactly what we want inside an Inngest step.
  await client.messages.create({ to: recipient.phone, from, body });
}
