import type { MarketingEmail, MarketingSender, SubscriberUrls } from "./sender";

export const TEST_URLS: SubscriberUrls = {
  confirm: (t) => `https://x.test/subscribe/confirm?token=${t}`,
  unsubscribePage: (t) => `https://x.test/unsubscribe?token=${t}`,
  oneClickUnsubscribe: (t) => `https://x.test/api/unsubscribe?token=${t}`,
};

/** Records sent mail; failNext() makes the next send throw like a Resend outage. */
export function fakeSender() {
  const sent: MarketingEmail[] = [];
  let failNext = false;
  const sender: MarketingSender = {
    async send(email) {
      if (failNext) {
        failNext = false;
        throw new Error("resend down");
      }
      sent.push(email);
    },
  };
  return { sender, sent, failNext: () => void (failNext = true) };
}

/** The raw confirm token from a confirmation email's text. */
export function tokenFromEmail(email: MarketingEmail): string {
  const match = email.text.match(/https:\/\/x\.test\/subscribe\/confirm\?token=(\S+)/);
  if (!match) throw new Error("no confirm link in email");
  return match[1];
}

const T0 = Date.parse("2026-10-20T12:00:00Z");
/** A fixed clock: at(0) is T0, at(11) is eleven minutes later. */
export const at = (minutes: number) => new Date(T0 + minutes * 60_000);
