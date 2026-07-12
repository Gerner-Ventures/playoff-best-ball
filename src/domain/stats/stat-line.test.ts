import { describe, it, expect } from "vitest";
import { emptyStatLine, parseStatLine, tryParseStatLine } from "./stat-line";

describe("stat-line", () => {
  it("empty line has zeroed stats, empty FG arrays, null pointsAllowed", () => {
    const line = emptyStatLine();
    expect(line.passYards).toBe(0);
    expect(line.fgMade).toEqual([]);
    expect(line.pointsAllowed).toBeNull();
  });

  it("parse fills defaults for missing fields (partial JSON from older syncs)", () => {
    const line = parseStatLine({ passYards: 312, passTd: 3 });
    expect(line.passYards).toBe(312);
    expect(line.rushYards).toBe(0);
    expect(line.fgMissed).toEqual([]);
  });

  it("rejects non-finite garbage", () => {
    expect(tryParseStatLine({ passYards: Infinity })).toBeNull();
    expect(tryParseStatLine("nope")).toBeNull();
  });

  it("allows negative yardage (sacks, kneel-downs) but round-trips cleanly", () => {
    const line = parseStatLine({ rushYards: -3 });
    expect(line.rushYards).toBe(-3);
    expect(parseStatLine(JSON.parse(JSON.stringify(line)))).toEqual(line);
  });
});
