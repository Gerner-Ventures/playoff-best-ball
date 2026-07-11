import { describe, it, expect } from "vitest";
import { generateInviteCode, INVITE_CODE_ALPHABET } from "./invite-code";

describe("generateInviteCode", () => {
  it("returns an 8-character code", () => {
    expect(generateInviteCode()).toHaveLength(8);
  });

  it("only uses unambiguous uppercase characters", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode();
      for (const ch of code) {
        expect(INVITE_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it("does not repeat across many generations", () => {
    const codes = new Set(Array.from({ length: 1000 }, generateInviteCode));
    expect(codes.size).toBe(1000);
  });
});
