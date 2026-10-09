import { describe, it, expect, afterEach, vi } from "vitest";
import { createMarketingSender, isMarketingSenderReady, type ResendLike } from "./marketing";
import type { MarketingEmail } from "@/domain/subscribers/sender";

const email: MarketingEmail = {
  to: "fan@example.com",
  subject: "Confirm",
  text: "body https://x.test/subscribe/confirm?token=abc",
  html: "<p>body</p>",
  oneClickUnsubscribeUrl: "https://x.test/api/unsubscribe?token=def",
};

function fakeResend(error: { name: string; message: string } | null = null) {
  const calls: Parameters<ResendLike["emails"]["send"]>[0][] = [];
  const resend: ResendLike = {
    emails: {
      async send(payload) {
        calls.push(payload);
        return { error };
      },
    },
  };
  return { resend, calls };
}

describe("createMarketingSender", () => {
  it("sends through Resend with RFC 8058 one-click unsubscribe headers", async () => {
    const { resend, calls } = fakeResend();
    await createMarketingSender({ resend, from: "PBB <hello@news.test>", mustSend: true }).send(email);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ from: "PBB <hello@news.test>", to: "fan@example.com", subject: "Confirm" });
    expect(calls[0].headers).toEqual({
      "List-Unsubscribe": "<https://x.test/api/unsubscribe?token=def>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("throws when Resend reports an error", async () => {
    const { resend } = fakeResend({ name: "validation_error", message: "bad from" });
    await expect(createMarketingSender({ resend, from: "x@news.test", mustSend: true }).send(email)).rejects.toThrow(/bad from/);
  });

  it("refuses to silently drop mail where it must send", async () => {
    await expect(createMarketingSender({ resend: null, from: undefined, mustSend: true }).send(email)).rejects.toThrow(/MARKETING_FROM_EMAIL/);
  });

  it("logs the email instead of sending in development", async () => {
    const lines: string[] = [];
    await createMarketingSender({ resend: null, from: undefined, mustSend: false, log: (l) => lines.push(l) }).send(email);
    expect(lines.join("\n")).toContain("https://x.test/subscribe/confirm?token=abc");
  });
});

describe("isMarketingSenderReady", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is true outside of mandatory-send production, regardless of config", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MARKETING_FROM_EMAIL", "");
    expect(isMarketingSenderReady()).toBe(true);
  });

  it("is false in production when RESEND_API_KEY or MARKETING_FROM_EMAIL is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_123");
    vi.stubEnv("MARKETING_FROM_EMAIL", "");
    expect(isMarketingSenderReady()).toBe(false);

    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MARKETING_FROM_EMAIL", "x@news.test");
    expect(isMarketingSenderReady()).toBe(false);
  });

  it("is true in production once both are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_123");
    vi.stubEnv("MARKETING_FROM_EMAIL", "x@news.test");
    expect(isMarketingSenderReady()).toBe(true);
  });
});
