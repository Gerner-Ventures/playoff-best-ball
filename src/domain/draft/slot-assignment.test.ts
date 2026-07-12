import { describe, it, expect } from "vitest";
import { assignSlot, FLEX_ELIGIBLE } from "./slot-assignment";
import { DEFAULT_ROSTER_SLOTS } from "../league-settings";

// DEFAULT_ROSTER_SLOTS: [QB, RB, RB, WR, WR, TE, FLEX, K, DST] (indexes 0-8)

describe("assignSlot", () => {
  it("fills the direct slot first", () => {
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [], "RB")).toBe(1);
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [1], "RB")).toBe(2);
  });

  it("overflows RB/WR/TE into FLEX when direct slots are full", () => {
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [1, 2], "RB")).toBe(6);
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [3, 4], "WR")).toBe(6);
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [5], "TE")).toBe(6);
  });

  it("returns null when nothing fits", () => {
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [1, 2, 6], "RB")).toBeNull();
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [0], "QB")).toBeNull(); // QB never flexes
    expect(assignSlot(DEFAULT_ROSTER_SLOTS, [7], "K")).toBeNull();
  });

  it("FLEX_ELIGIBLE is RB/WR/TE", () => {
    expect(FLEX_ELIGIBLE).toEqual(["RB", "WR", "TE"]);
  });
});
