import { describe, it, expect } from "vitest";
import { botPick, BOT_WINDOW, type BotCandidate } from "./bot-pick";
import { DEFAULT_ROSTER_SLOTS } from "../league-settings";

const rb = (id: string): BotCandidate => ({ id, position: "RB" });
const qb = (id: string): BotCandidate => ({ id, position: "QB" });

describe("botPick", () => {
  it("takes the best available when rng favours the top of the window", () => {
    const got = botPick([rb("a"), rb("b"), rb("c")], [], DEFAULT_ROSTER_SLOTS, () => 0);
    expect(got?.playerId).toBe("a");
  });

  it("reaches deeper into the window as rng rises", () => {
    const pool = [rb("a"), rb("b"), rb("c"), rb("d"), rb("e")];
    // weights 5/4/3/2/1 over total 15: cumulative 5,9,12,14,15
    const at = (r: number) => botPick(pool, [], DEFAULT_ROSTER_SLOTS, () => r / 15)?.playerId;
    expect(at(0)).toBe("a");
    expect(at(6)).toBe("b");
    expect(at(10)).toBe("c");
    expect(at(13)).toBe("d");
    expect(at(14.5)).toBe("e");
  });

  it("never chooses outside the top BOT_WINDOW candidates", () => {
    const pool = Array.from({ length: 40 }, (_, i) => rb(`p${i}`));
    const allowed = new Set(pool.slice(0, BOT_WINDOW).map((p) => p.id));
    for (let i = 0; i < 200; i++) {
      const got = botPick(pool, [], DEFAULT_ROSTER_SLOTS, () => i / 200);
      expect(allowed.has(got!.playerId)).toBe(true);
    }
  });

  it("skips players whose position has no open slot", () => {
    // DEFAULT_ROSTER_SLOTS has exactly one QB slot; fill it.
    const qbSlot = DEFAULT_ROSTER_SLOTS.findIndex((s) => s.slot === "QB");
    const got = botPick([qb("taken-pos"), rb("ok")], [qbSlot], DEFAULT_ROSTER_SLOTS, () => 0);
    expect(got?.playerId).toBe("ok");
  });

  it("returns null when nothing fits", () => {
    const allFilled = DEFAULT_ROSTER_SLOTS.map((_, i) => i);
    expect(botPick([rb("a")], allFilled, DEFAULT_ROSTER_SLOTS, () => 0)).toBeNull();
  });

  it("weights a short window relative to its own size", () => {
    const pool = [rb("a"), rb("b")]; // weights 2/1 over total 3
    expect(botPick(pool, [], DEFAULT_ROSTER_SLOTS, () => 0)?.playerId).toBe("a");
    expect(botPick(pool, [], DEFAULT_ROSTER_SLOTS, () => 0.9)?.playerId).toBe("b");
  });
});
