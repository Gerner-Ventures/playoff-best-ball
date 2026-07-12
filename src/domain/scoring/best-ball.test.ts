import { describe, it, expect } from "vitest";
import { optimalLineup } from "./best-ball";
import { DEFAULT_ROSTER_SLOTS } from "../league-settings";

// DEFAULT_ROSTER_SLOTS: [QB, RB, RB, WR, WR, TE, FLEX, K, DST]

const p = (playerId: string, position: string, points: number) =>
  ({ playerId, position, points }) as { playerId: string; position: "QB" | "RB" | "WR" | "TE" | "K" | "DST"; points: number };

describe("optimalLineup", () => {
  it("fills direct slots with the best at each position, FLEX with best leftover", () => {
    const result = optimalLineup(DEFAULT_ROSTER_SLOTS, [
      p("qb1", "QB", 20), p("qb2", "QB", 25),
      p("rb1", "RB", 15), p("rb2", "RB", 12), p("rb3", "RB", 9),
      p("wr1", "WR", 14), p("wr2", "WR", 11), p("wr3", "WR", 10),
      p("te1", "TE", 8),
      p("k1", "K", 7), p("dst1", "DST", 6),
    ]);
    const byIndex = new Map(result.slots.map((s) => [s.slotIndex, s.playerId]));
    expect(byIndex.get(0)).toBe("qb2"); // best QB
    expect([byIndex.get(1), byIndex.get(2)].sort()).toEqual(["rb1", "rb2"]);
    expect(byIndex.get(6)).toBe("wr3"); // FLEX: wr3(10) beats rb3(9)
    expect(result.total).toBeCloseTo(25 + 15 + 12 + 14 + 11 + 8 + 10 + 7 + 6);
  });

  it("leaves slots empty (null, 0 pts) when the position is missing", () => {
    const result = optimalLineup(DEFAULT_ROSTER_SLOTS, [p("rb1", "RB", 10)]);
    const filled = result.slots.filter((s) => s.playerId !== null);
    expect(filled).toHaveLength(1);
    expect(result.total).toBeCloseTo(10);
  });

  it("never uses a player twice (second-best RB stays out of FLEX if used in RB2)", () => {
    const result = optimalLineup(DEFAULT_ROSTER_SLOTS, [
      p("rb1", "RB", 20), p("rb2", "RB", 18), p("rb3", "RB", 16),
    ]);
    const used = result.slots.filter((s) => s.playerId).map((s) => s.playerId);
    expect(new Set(used).size).toBe(used.length);
    expect(used).toHaveLength(3); // RB, RB, FLEX
    expect(result.total).toBeCloseTo(54);
  });

  it("QB/K/DST never flex", () => {
    const result = optimalLineup(DEFAULT_ROSTER_SLOTS, [
      p("qb1", "QB", 30), p("qb2", "QB", 29), p("k1", "K", 28), p("k2", "K", 27),
    ]);
    const flexSlot = result.slots[6];
    expect(flexSlot.playerId).toBeNull();
  });
});
