import { describe, it, expect } from "vitest";
import { buildWeeklyRecap } from "./recap";
import type { LeagueScores } from "@/lib/league-scores";

// Minimal LeagueScores stub: 3 entries, two weeks of totals.
function scores(): LeagueScores {
  const mk = (entryId: string, name: string, w1: number, w2: number) => ({
    entryId,
    name,
    ownerName: name,
    alivePlayers: 9,
    grandTotal: w1 + w2,
    weeks: [
      { week: 1, total: w1, lineup: [], bench: [] },
      { week: 2, total: w2, lineup: [], bench: [] },
      { week: 3, total: 0, lineup: [], bench: [] },
      { week: 4, total: 0, lineup: [], bench: [] },
    ],
  });
  return {
    weeks: [1, 2, 3, 4],
    rosterSize: 9,
    entries: [mk("a", "Alpha", 100, 10), mk("b", "Bravo", 80, 50), mk("c", "Charlie", 90, 20)],
  } as LeagueScores;
}

describe("buildWeeklyRecap", () => {
  it("ranks through the recap week and reports movement vs the prior week", () => {
    const recap = buildWeeklyRecap(scores(), 2);
    // through week 1: Alpha 100 (1st), Charlie 90 (2nd), Bravo 80 (3rd)
    // through week 2: Bravo 130 (1st), Alpha 110 / Charlie 110 (tie)
    const bravo = recap.entries.find((e) => e.entryId === "b")!;
    expect(bravo.rank).toBe(1);
    expect(bravo.prevRank).toBe(3);
    expect(bravo.weekPoints).toBe(50);
    expect(recap.topPerformer.entryId).toBe("b");
    expect(recap.topPerformer.weekPoints).toBe(50);
  });

  it("week 1 has no movement (prevRank equals rank)", () => {
    const recap = buildWeeklyRecap(scores(), 1);
    for (const e of recap.entries) expect(e.prevRank).toBe(e.rank);
  });
});
