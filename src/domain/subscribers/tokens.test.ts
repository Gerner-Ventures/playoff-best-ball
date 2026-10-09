import { describe, it, expect } from "vitest";
import { hashToken, isWellFormedToken, newToken, normalizeEmail } from "./tokens";

describe("tokens", () => {
  it("newToken is 43 URL-safe characters and unique", () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("hashToken is a stable 64-hex sha256", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("isWellFormedToken accepts app tokens and backfilled hex tokens", () => {
    expect(isWellFormedToken(newToken())).toBe(true);
    expect(isWellFormedToken("a1".repeat(32))).toBe(true);
  });

  it("isWellFormedToken rejects truncated, mangled and non-string input", () => {
    for (const bad of ["", "abc", newToken().slice(0, 20), "x".repeat(200), "has space in it 0123456789abcdef0123", "%2Fencoded%2Fjunk0123456789abcdef", undefined, null, 42, {}]) {
      expect(isWellFormedToken(bad)).toBe(false);
    }
  });

  it("normalizeEmail trims and lowercases", () => {
    expect(normalizeEmail("  Fan@Example.COM ")).toBe("fan@example.com");
  });
});
