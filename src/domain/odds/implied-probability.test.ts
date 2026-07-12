import { describe, it, expect } from "vitest";
import { moneylineToProb, removeVig } from "./implied-probability";

describe("moneylineToProb", () => {
  it("favorites and underdogs", () => {
    expect(moneylineToProb(-200)).toBeCloseTo(200 / 300); // 0.6667
    expect(moneylineToProb(150)).toBeCloseTo(100 / 250); // 0.4
    expect(moneylineToProb(-110)).toBeCloseTo(110 / 210);
  });
});

describe("removeVig", () => {
  it("normalizes a pair to sum to 1", () => {
    const [a, b] = removeVig(moneylineToProb(-110), moneylineToProb(-110));
    expect(a).toBeCloseTo(0.5);
    expect(b).toBeCloseTo(0.5);
    expect(a + b).toBeCloseTo(1);
  });
});
