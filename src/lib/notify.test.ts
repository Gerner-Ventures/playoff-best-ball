import { describe, it, expect } from "vitest";
import { channelsFor, smsBodyFor } from "./notify";
import { isDeadSubscriptionStatus } from "./notify-push";

const subs = [{ id: "s1", endpoint: "e", p256dh: "k", auth: "a" }];

describe("channelsFor", () => {
  it("email always; sms only with phone AND opt-in; push only with subscriptions", () => {
    expect(channelsFor({ phone: null, smsOptIn: false, pushSubscriptions: [] })).toEqual(["email"]);
    expect(channelsFor({ phone: "+15555550123", smsOptIn: false, pushSubscriptions: [] })).toEqual(["email"]);
    expect(channelsFor({ phone: null, smsOptIn: true, pushSubscriptions: [] })).toEqual(["email"]);
    expect(channelsFor({ phone: "+15555550123", smsOptIn: true, pushSubscriptions: [] })).toEqual(["email", "sms"]);
    expect(channelsFor({ phone: "+15555550123", smsOptIn: true, pushSubscriptions: subs })).toEqual(["email", "sms", "push"]);
    expect(channelsFor({ phone: null, smsOptIn: false, pushSubscriptions: subs })).toEqual(["email", "push"]);
  });
});

describe("smsBodyFor", () => {
  it("prefers smsText, else subject + url", () => {
    expect(smsBodyFor({ subject: "S", text: "long", smsText: "short" })).toBe("short");
    expect(smsBodyFor({ subject: "S", text: "long", url: "https://x/y" })).toBe("S https://x/y");
    expect(smsBodyFor({ subject: "S", text: "long" })).toBe("S");
  });
});

describe("isDeadSubscriptionStatus", () => {
  it("404/410 are dead; everything else is not", () => {
    expect(isDeadSubscriptionStatus(404)).toBe(true);
    expect(isDeadSubscriptionStatus(410)).toBe(true);
    expect(isDeadSubscriptionStatus(429)).toBe(false);
    expect(isDeadSubscriptionStatus(500)).toBe(false);
    expect(isDeadSubscriptionStatus(undefined)).toBe(false);
  });
});
