import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { requestSubscription } from "./subscribe";
import { confirmSubscription, CONFIRM_TTL_MS } from "./confirm";
import { unsubscribeByToken } from "./unsubscribe";
import { newToken } from "./tokens";
import { at, fakeSender, TEST_URLS, tokenFromEmail } from "./test-support";

async function pending(email = "fan@example.com") {
  const mail = fakeSender();
  await requestSubscription(testDb, mail.sender, TEST_URLS, { email, source: "footer", now: at(0) });
  const row = await testDb.emailSubscriber.findUniqueOrThrow({ where: { email } });
  return { token: tokenFromEmail(mail.sent[0]), row };
}

describe("confirmSubscription", () => {
  beforeEach(resetDb);

  it("activates a PENDING row and reports its source", async () => {
    const { token, row } = await pending();
    const outcome = await confirmSubscription(testDb, { token, now: at(5) });

    expect(outcome).toEqual({ result: "confirmed", subscriberId: row.id, source: "footer" });
    const after = await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.confirmedAt).toEqual(at(5));
  });

  it("is idempotent: a re-click says already confirmed", async () => {
    const { token } = await pending();
    await confirmSubscription(testDb, { token, now: at(5) });
    expect(await confirmSubscription(testDb, { token, now: at(9) })).toEqual({ result: "already_confirmed" });
  });

  it("survives a double-click: one confirms, the other is already confirmed, nothing throws", async () => {
    const { token } = await pending();
    const results = await Promise.all([
      confirmSubscription(testDb, { token, now: at(5) }),
      confirmSubscription(testDb, { token, now: at(5) }),
    ]);
    expect(results.map((r) => r.result).sort()).toEqual(["already_confirmed", "confirmed"]);
  });

  it("expires after 7 days and leaves the row PENDING", async () => {
    const { token, row } = await pending();
    const late = new Date(at(0).getTime() + CONFIRM_TTL_MS + 1);
    expect(await confirmSubscription(testDb, { token, now: late })).toEqual({ result: "expired" });
    expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING");
  });

  it("rejects malformed, truncated and unknown tokens without touching the database", async () => {
    const { token } = await pending();
    for (const bad of [undefined, null, "", "abc", token.slice(0, 20), "x".repeat(300), newToken()]) {
      expect(await confirmSubscription(testDb, { token: bad, now: at(5) })).toEqual({ result: "invalid" });
    }
  });

  it("never lets an old confirm link undo an unsubscribe", async () => {
    const { token, row } = await pending();
    await confirmSubscription(testDb, { token, now: at(5) });
    await unsubscribeByToken(testDb, { token: row.unsubscribeToken, now: at(10) });
    expect(await confirmSubscription(testDb, { token, now: at(11) })).toEqual({ result: "invalid" });
  });
});
