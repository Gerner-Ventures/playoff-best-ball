import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MarketingEmail } from "@/domain/subscribers/sender";
import { newToken } from "@/domain/subscribers/tokens";
import { testDb, resetDb } from "../../../../tests/helpers/db";

const mail = vi.hoisted(() => ({ sent: [] as MarketingEmail[], fail: false, ready: true }));
vi.mock("@/lib/email/marketing", () => ({
  getMarketingSender: () => ({
    async send(email: MarketingEmail) {
      if (mail.fail) throw new Error("resend down");
      mail.sent.push(email);
    },
  }),
  isMarketingSenderReady: () => mail.ready,
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/subscribe", () => {
  beforeEach(async () => {
    await resetDb();
    mail.sent.length = 0;
    mail.fail = false;
    mail.ready = true;
  });

  it("returns the same 200 for a new address and an already-active one", async () => {
    const first = await post({ email: "fan@example.com", source: "footer" });
    await testDb.emailSubscriber.update({ where: { email: "fan@example.com" }, data: { status: "ACTIVE" } });
    const second = await post({ email: "fan@example.com", source: "footer" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect(await second.json()).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(1);
  });

  it("drops honeypot submissions behind a normal-looking 200", async () => {
    const res = await post({ email: "bot@example.com", source: "footer", website: "http://spam" });
    expect(res.status).toBe(200);
    expect(await testDb.emailSubscriber.count()).toBe(0);
  });

  it("rejects garbage with a 400 and a message, never a 500", async () => {
    for (const body of ["not json", { email: "nope", source: "footer" }, { email: `${"a".repeat(250)}@example.com`, source: "footer" }, { email: "fan@example.com", source: "account" }, {}]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toEqual(expect.any(String));
    }
  });

  it("returns 502 when the confirmation can't be sent, and a retry works", async () => {
    mail.fail = true;
    const failed = await post({ email: "fan@example.com", source: "footer" });
    expect(failed.status).toBe(502);
    expect((await failed.json()).error).toMatch(/couldn't send/i);

    mail.fail = false;
    expect((await post({ email: "fan@example.com", source: "footer" })).status).toBe(200);
    expect(mail.sent).toHaveLength(1);
  });

  it("502s before touching the database when the marketing sender isn't ready, for member and stranger alike", async () => {
    await testDb.emailSubscriber.create({
      data: { email: "member@example.com", source: "footer", status: "ACTIVE", unsubscribeToken: newToken() },
    });
    mail.ready = false;

    const memberRes = await post({ email: "member@example.com", source: "footer" });
    const strangerRes = await post({ email: "new@example.com", source: "footer" });

    expect(memberRes.status).toBe(502);
    expect(strangerRes.status).toBe(502);
    expect(await memberRes.json()).toEqual({ error: "We couldn't send the confirmation email — try again." });
    expect(await strangerRes.json()).toEqual({ error: "We couldn't send the confirmation email — try again." });
    expect(mail.sent).toHaveLength(0);
    expect(await testDb.emailSubscriber.count()).toBe(1);
    expect(
      await testDb.emailSubscriber.findUniqueOrThrow({ where: { email: "member@example.com" } }),
    ).toMatchObject({ status: "ACTIVE" });
  });
});
