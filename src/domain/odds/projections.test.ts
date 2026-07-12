import { describe, it, expect } from "vitest";
import { projectPoints, POSITION_AVERAGES } from "./projections";

describe("projectPoints", () => {
  it("falls back to the position average with no games", () => {
    const p = projectPoints("QB", []);
    expect(p.projectedPoints).toBe(POSITION_AVERAGES.QB);
    expect(p.confidence).toBe("low");
    expect(p.gamesPlayed).toBe(0);
  });

  it("uses recency-weighted average of played games", () => {
    // weights: week2 game ×1, week1 game ×0.8 → (0.8*10 + 1*20) / 1.8
    const p = projectPoints("RB", [
      { week: 1, points: 10 },
      { week: 2, points: 20 },
    ]);
    expect(p.projectedPoints).toBeCloseTo((0.8 * 10 + 20) / 1.8);
    expect(p.confidence).toBe("high"); // ≥2 games
    expect(p.gamesPlayed).toBe(2);
  });

  it("one game = medium confidence; zero-point games don't count as played", () => {
    expect(projectPoints("WR", [{ week: 1, points: 12 }]).confidence).toBe("medium");
    const zero = projectPoints("WR", [{ week: 1, points: 0 }]);
    expect(zero.confidence).toBe("low");
    expect(zero.projectedPoints).toBe(POSITION_AVERAGES.WR);
    expect(zero.gamesPlayed).toBe(0);
  });
});
