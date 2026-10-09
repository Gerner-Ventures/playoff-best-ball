import { describe, it, expect } from "vitest";
import { scoringSettingsSchema } from "./league-settings";
import { EXCLUDED_SCORING_KEYS, rosterReference, scoringReference } from "./scoring-reference";

describe("scoringReference", () => {
  const rows = scoringReference().flatMap((g) => g.rows);

  it("accounts for every scoring setting: shown, or excluded on purpose", () => {
    const shown = rows.map((r) => r.key);
    expect([...shown, ...EXCLUDED_SCORING_KEYS].sort()).toEqual(Object.keys(scoringSettingsSchema.shape).sort());
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("reads each preset's own values", () => {
    const reception = rows.find((r) => r.key === "ppr")!;
    expect([reception.standard, reception.halfPpr, reception.fullPpr]).toEqual(["0", "+0.5", "+1"]);
    const passTd = rows.find((r) => r.key === "passTd")!;
    expect(passTd.standard).toBe("+6");
    const passYards = rows.find((r) => r.key === "passYardsPerPoint")!;
    expect(passYards.standard).toBe("1 per 30 yds");
  });

  it("lists the default roster with FLEX eligibility", () => {
    expect(rosterReference()).toEqual(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX (RB/WR/TE)", "K", "DST"]);
  });
});
