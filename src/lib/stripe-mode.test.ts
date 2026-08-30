import { describe, it, expect } from "vitest";
import { stripeModeFromKey } from "./stripe-mode";

describe("stripeModeFromKey", () => {
  it("reports billing off when no key is configured", () => {
    expect(stripeModeFromKey(undefined)).toBe("off");
    expect(stripeModeFromKey("")).toBe("off");
  });

  it("distinguishes test from live secret keys", () => {
    expect(stripeModeFromKey("sk_test_51R08lOabcdef")).toBe("test");
    expect(stripeModeFromKey("sk_live_51R08lOabcdef")).toBe("live");
  });

  it("recognizes restricted keys, which carry the same mode infix", () => {
    expect(stripeModeFromKey("rk_test_51R08lOabcdef")).toBe("test");
    expect(stripeModeFromKey("rk_live_51R08lOabcdef")).toBe("live");
  });

  it("reports unknown rather than guessing a mode it cannot prove", () => {
    // A misconfigured value must never read as "test" — that would show an
    // all-clear badge over a key that could be live.
    expect(stripeModeFromKey("pk_test_51R08lOabcdef")).toBe("unknown");
    expect(stripeModeFromKey("whsec_abcdef")).toBe("unknown");
    expect(stripeModeFromKey("sk_51R08lOabcdef")).toBe("unknown");
    expect(stripeModeFromKey("   ")).toBe("unknown");
  });
});
