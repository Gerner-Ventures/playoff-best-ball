import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { resubscribeByToken, unsubscribeByToken } from "./unsubscribe";
import { newToken } from "./tokens";
import { at } from "./test-support";

async function row(status: "PENDING" | "ACTIVE" | "UNSUBSCRIBED", confirmedAt: Date | null = null) {
  return testDb.emailSubscriber.create({
    data: { email: `${status.toLowerCase()}@example.com`, source: "footer", status, unsubscribeToken: newToken(), confirmedAt },
  });
}

describe("unsubscribeByToken", () => {
  beforeEach(resetDb);

  it("unsubscribes an ACTIVE row, then reports already unsubscribed", async () => {
    const r = await row("ACTIVE", at(0));
    expect(await unsubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(1) })).toEqual({ result: "unsubscribed", subscriberId: r.id });
    expect(await unsubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(2) })).toEqual({ result: "already_unsubscribed" });
    const after = await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("UNSUBSCRIBED");
    expect(after.unsubscribedAt).toEqual(at(1));
  });

  it("also stops a PENDING signup (the link in the confirmation email)", async () => {
    const r = await row("PENDING");
    expect((await unsubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(1) })).result).toBe("unsubscribed");
  });

  it("survives a double-click", async () => {
    const r = await row("ACTIVE", at(0));
    const results = await Promise.all([
      unsubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(1) }),
      unsubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(1) }),
    ]);
    expect(results.map((x) => x.result).sort()).toEqual(["already_unsubscribed", "unsubscribed"]);
  });

  it("rejects malformed and unknown tokens", async () => {
    for (const bad of [undefined, "", "short", "%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%", newToken()]) {
      expect(await unsubscribeByToken(testDb, { token: bad, now: at(1) })).toEqual({ result: "invalid" });
    }
  });
});

describe("resubscribeByToken", () => {
  beforeEach(resetDb);

  it("restores ACTIVE directly and keeps the original confirmation time", async () => {
    const r = await row("UNSUBSCRIBED", at(0));
    expect(await resubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(5) })).toEqual({ result: "resubscribed", subscriberId: r.id });
    const after = await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.confirmedAt).toEqual(at(0));
    expect(after.unsubscribedAt).toBeNull();
  });

  it("stamps confirmedAt for a row that was never confirmed (the token proves control of the inbox)", async () => {
    const r = await row("UNSUBSCRIBED", null);
    await resubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(5) });
    expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: r.id } })).confirmedAt).toEqual(at(5));
  });

  it("is a no-op for ACTIVE and rejects unknown tokens", async () => {
    const r = await row("ACTIVE", at(0));
    expect(await resubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(5) })).toEqual({ result: "already_active" });
    expect(await resubscribeByToken(testDb, { token: newToken(), now: at(5) })).toEqual({ result: "invalid" });
  });

  it("survives a double-click: one resubscribes, the other is already active, nothing throws", async () => {
    const r = await row("UNSUBSCRIBED", at(0));
    const results = await Promise.all([
      resubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(5) }),
      resubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(5) }),
    ]);
    expect(results.map((x) => x.result).sort()).toEqual(["already_active", "resubscribed"]);
  });

  it("rejects a PENDING row's token and leaves it PENDING (not a valid transition)", async () => {
    const r = await row("PENDING");
    expect(await resubscribeByToken(testDb, { token: r.unsubscribeToken, now: at(5) })).toEqual({ result: "invalid" });
    expect((await testDb.emailSubscriber.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("PENDING");
  });
});
