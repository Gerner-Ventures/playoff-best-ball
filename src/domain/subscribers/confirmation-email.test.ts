import { describe, it, expect } from "vitest";
import { buildConfirmationEmail } from "./confirmation-email";

const input = {
  to: "fan@example.com",
  confirmUrl: "https://x.test/subscribe/confirm?token=abc&x=1",
  unsubscribePageUrl: "https://x.test/unsubscribe?token=def",
  oneClickUnsubscribeUrl: "https://x.test/api/unsubscribe?token=def",
};

describe("buildConfirmationEmail", () => {
  it("addresses the email and carries both links in text and html", () => {
    const email = buildConfirmationEmail(input);
    expect(email.to).toBe("fan@example.com");
    expect(email.subject).toMatch(/confirm/i);
    expect(email.text).toContain(input.confirmUrl);
    expect(email.text).toContain(input.unsubscribePageUrl);
    expect(email.html).toContain("https://x.test/subscribe/confirm?token=abc&amp;x=1");
    expect(email.oneClickUnsubscribeUrl).toBe(input.oneClickUnsubscribeUrl);
  });

  it("says how long the link lasts and that ignoring it is safe", () => {
    const { text } = buildConfirmationEmail(input);
    expect(text).toMatch(/7 days/);
    expect(text).toMatch(/ignore this email/i);
  });
});
