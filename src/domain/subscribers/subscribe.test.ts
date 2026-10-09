import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { requestSubscription, ConfirmationEmailFailedError } from "./subscribe";
import { hashToken, newToken } from "./tokens";
import { at, fakeSender, TEST_URLS, tokenFromEmail } from "./test-support";

const subscribe = (sender: ReturnType<typeof fakeSender>["sender"], email: string, minutes = 0, source = "footer" as const) =>
  requestSubscription(testDb, sender, TEST_URLS, { email, source, now: at(minutes) });

describe("requestSubscription", () => {
  beforeEach(resetDb);

  it("creates a PENDING row and emails a confirm link that matches the stored hash", async () => {
    const mail = fakeSender();
    const result = await subscribe(mail.sender, "fan@example.com");

    expect(result.outcome).toBe("sent");
    const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: "fan@example.com" } });
    expect(row.status).toBe("PENDING");
    expect(row.source).toBe("footer");
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("fan@example.com");
    expect(hashToken(tokenFromEmail(mail.sent[0]))).toBe(row.confirmTokenHash);
    expect(mail.sent[0].oneClickUnsubscribeUrl).toBe(TEST_URLS.oneClickUnsubscribe(row.unsubscribeToken));
  });

  it("treats case and whitespace variants as one address, throttling the repeat", async () => {
    const mail = fakeSender();
    await subscribe(mail.sender, "  Fan@Example.COM ");
    const again = await subscribe(mail.sender, "fan@example.com", 5);

    expect(again.outcome).toBe("throttled");
    expect(await testDb.emailSubscriber.count()).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });

  it("resends with a fresh token once the 10-minute throttle has passed", async () => {
    const mail = fakeSender();
    await subscribe(mail.sender, "fan@example.com");
    const before = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: "fan@example.com" } });
    const again = await subscribe(mail.sender, "fan@example.com", 11);

    expect(again.outcome).toBe("sent");
    const after = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: "fan@example.com" } });
    expect(after.confirmTokenHash).not.toBe(before.confirmTokenHash);
    expect(mail.sent).toHaveLength(2);
  });

  it("sends nothing to an address that is already ACTIVE", async () => {
    await testDb.emailSubscriber.create({
      data: { email: "on@example.com", source: "footer", status: "ACTIVE", unsubscribeToken: newToken() },
    });
    const mail = fakeSender();
    const result = await subscribe(mail.sender, "on@example.com");

    expect(result.outcome).toBe("already_active");
    expect(mail.sent).toHaveLength(0);
  });

  it("makes an UNSUBSCRIBED address re-confirm, still respecting the throttle", async () => {
    await testDb.emailSubscriber.create({
      data: { email: "gone@example.com", source: "footer", status: "UNSUBSCRIBED", unsubscribeToken: newToken(), confirmSentAt: at(0) },
    });
    const mail = fakeSender();

    expect((await subscribe(mail.sender, "gone@example.com", 3)).outcome).toBe("throttled");
    expect((await subscribe(mail.sender, "gone@example.com", 30)).outcome).toBe("sent");
    const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: "gone@example.com" } });
    expect(row.status).toBe("PENDING");
  });

  it("keeps the first source", async () => {
    const mail = fakeSender();
    await subscribe(mail.sender, "fan@example.com", 0, "footer");
    await requestSubscription(testDb, mail.sender, TEST_URLS, { email: "fan@example.com", source: "faq", now: at(30) });
    const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: "fan@example.com" } });
    expect(row.source).toBe("footer");
  });

  it("throws ConfirmationEmailFailedError on a failed send, and an immediate retry is not throttled", async () => {
    const mail = fakeSender();
    mail.failNext();
    await expect(subscribe(mail.sender, "fan@example.com")).rejects.toBeInstanceOf(ConfirmationEmailFailedError);

    const retry = await subscribe(mail.sender, "fan@example.com", 1);
    expect(retry.outcome).toBe("sent");
    expect(mail.sent).toHaveLength(1);
  });

  it("survives two first signups racing for one address", async () => {
    const mail = fakeSender();
    const results = await Promise.all([subscribe(mail.sender, "race@example.com"), subscribe(mail.sender, "race@example.com")]);

    expect(results.map((r) => r.outcome).sort()).toEqual(["sent", "throttled"]);
    expect(await testDb.emailSubscriber.count()).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });
});
