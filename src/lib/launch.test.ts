import { describe, it, expect } from "vitest";
import { getLaunchPhase, SIGNUPS_OPEN_AT } from "./launch";

describe("getLaunchPhase", () => {
  it("asks for the list before signups open, and for a league from that instant on", () => {
    expect(getLaunchPhase(new Date(SIGNUPS_OPEN_AT.getTime() - 1))).toBe("list");
    expect(getLaunchPhase(SIGNUPS_OPEN_AT)).toBe("signups_open");
    expect(getLaunchPhase(new Date(SIGNUPS_OPEN_AT.getTime() + 86_400_000))).toBe("signups_open");
  });
});
