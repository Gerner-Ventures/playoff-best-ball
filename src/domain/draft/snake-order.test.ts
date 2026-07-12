import { describe, it, expect } from "vitest";
import {
  entryIndexForPick,
  entryIdForPick,
  totalPicks,
  shuffleOrder,
  draftOrderSchema,
} from "./snake-order";

describe("entryIndexForPick", () => {
  it("snakes: 0,1,2,2,1,0,0,1,2 for 3 entries", () => {
    const got = Array.from({ length: 9 }, (_, i) => entryIndexForPick(3, i));
    expect(got).toEqual([0, 1, 2, 2, 1, 0, 0, 1, 2]);
  });

  it("handles 2 entries", () => {
    const got = Array.from({ length: 6 }, (_, i) => entryIndexForPick(2, i));
    expect(got).toEqual([0, 1, 1, 0, 0, 1]);
  });
});

describe("entryIdForPick", () => {
  it("maps through the order array", () => {
    expect(entryIdForPick(["a", "b", "c"], 3)).toBe("c"); // round 2 reverses
    expect(entryIdForPick(["a", "b", "c"], 5)).toBe("a");
  });
});

describe("totalPicks", () => {
  it("is entries × roster slots", () => {
    expect(totalPicks(10, 9)).toBe(90);
  });
});

describe("shuffleOrder", () => {
  it("returns a permutation of the input", () => {
    const input = ["a", "b", "c", "d", "e"];
    const out = shuffleOrder(input);
    expect([...out].sort()).toEqual([...input].sort());
    expect(input).toEqual(["a", "b", "c", "d", "e"]); // input not mutated
  });
});

describe("draftOrderSchema", () => {
  it("accepts a string array of ≥2 and rejects junk", () => {
    expect(draftOrderSchema.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(draftOrderSchema.safeParse(["a"]).success).toBe(false);
    expect(draftOrderSchema.safeParse("nope").success).toBe(false);
  });
});
