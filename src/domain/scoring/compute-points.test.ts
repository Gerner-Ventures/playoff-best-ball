import { describe, it, expect } from "vitest";
import { computePoints, roundPoints } from "./compute-points";
import { SCORING_PRESETS } from "../league-settings";
import { emptyStatLine, type StatLine } from "../stats/stat-line";

const half = SCORING_PRESETS.half_ppr;

function line(overrides: Partial<StatLine>): StatLine {
  return { ...emptyStatLine(), ...overrides };
}

describe("computePoints", () => {
  it("scores a QB line (30yd/pt pass, 6/TD, -2/INT, 10yd/pt rush)", () => {
    const b = computePoints(line({ passYards: 300, passTd: 3, passInt: 1, rushYards: 20 }), half);
    expect(b.passing).toBeCloseTo(300 / 30 + 3 * 6 - 2); // 26
    expect(b.rushing).toBeCloseTo(2);
    expect(b.total).toBeCloseTo(28);
  });

  it("scores a WR line with half PPR", () => {
    const b = computePoints(line({ recYards: 110, recTd: 1, receptions: 8 }), half);
    expect(b.receiving).toBeCloseTo(11 + 6 + 4); // 21
  });

  it("full PPR differs only by reception value", () => {
    const stats = line({ receptions: 10 });
    expect(computePoints(stats, SCORING_PRESETS.full_ppr).total).toBeCloseTo(10);
    expect(computePoints(stats, SCORING_PRESETS.standard).total).toBeCloseTo(0);
  });

  it("scores kicking by distance bucket, with misses", () => {
    const b = computePoints(
      line({ fgMade: [19, 29, 39, 49, 55], fgMissed: [40], xpMade: 3, xpMissed: 1 }),
      half,
    );
    // 3 + 3 + 3 + 4 + 5 - 1 + 3*1 - 1 = 19
    expect(b.kicking).toBeCloseTo(19);
  });

  it("scores DST including every points-allowed bucket boundary", () => {
    const base = line({ sacks: 3, defInterceptions: 2, fumblesRecovered: 1, defensiveTd: 1, safeties: 1, blockedKicks: 1 });
    // 3 + 4 + 2 + 6 + 4 + 2 = 21 before PA
    const paCases: [number, number][] = [
      [0, 10], [1, 7], [6, 7], [7, 4], [13, 4], [14, 1], [20, 1],
      [21, 0], [27, 0], [28, -1], [34, -1], [35, -3], [50, -3],
    ];
    for (const [pa, pts] of paCases) {
      const b = computePoints({ ...base, pointsAllowed: pa }, half);
      expect(b.defense).toBeCloseTo(21 + pts);
    }
    // null pointsAllowed (non-DST) adds nothing
    expect(computePoints(base, half).defense).toBeCloseTo(21);
  });

  it("scores misc (2pt, fumbles lost, return TD)", () => {
    const b = computePoints(line({ twoPtConv: 1, fumblesLost: 2, returnTd: 1 }), half);
    expect(b.misc).toBeCloseTo(2 - 4 + 6);
  });

  it("roundPoints rounds to 2 decimals", () => {
    expect(roundPoints(10.005)).toBeCloseTo(10.01);
    expect(roundPoints(1 / 3)).toBe(0.33);
  });
});
