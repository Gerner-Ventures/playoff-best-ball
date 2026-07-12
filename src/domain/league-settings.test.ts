import { describe, it, expect } from "vitest";
import {
  buildDefaultSettings,
  SCORING_PRESETS,
  DEFAULT_ROSTER_SLOTS,
  leagueSettingsSchema,
} from "./league-settings";

describe("SCORING_PRESETS", () => {
  it("differ only in ppr across the three presets", () => {
    expect(SCORING_PRESETS.standard.ppr).toBe(0);
    expect(SCORING_PRESETS.half_ppr.ppr).toBe(0.5);
    expect(SCORING_PRESETS.full_ppr.ppr).toBe(1);
    expect({ ...SCORING_PRESETS.standard, ppr: 0.5 }).toEqual(SCORING_PRESETS.half_ppr);
    expect({ ...SCORING_PRESETS.standard, ppr: 1 }).toEqual(SCORING_PRESETS.full_ppr);
  });
});

describe("buildDefaultSettings", () => {
  it("builds valid settings from a preset and pick clock", () => {
    const settings = buildDefaultSettings("half_ppr", 8);
    expect(settings.scoringPreset).toBe("half_ppr");
    expect(settings.scoring.ppr).toBe(0.5);
    expect(settings.pickClockHours).toBe(8);
    expect(settings.rosterSlots).toEqual(DEFAULT_ROSTER_SLOTS);
    expect(settings.maxEntries).toBe(10);
    expect(settings.substitutionsEnabled).toBe(false);
    expect(settings.overnightPause).toBe(true);
    expect(settings.settingsVersion).toBe(1);
    expect(settings.venmoHandle).toBeNull();
    // round-trips through its own schema (what we store in League.settings JSON)
    expect(leagueSettingsSchema.parse(settings)).toEqual(settings);
  });

  it("parses pre-4A settings JSON (no venmoHandle) via the default", () => {
    const legacy = { ...buildDefaultSettings("standard", 8) } as Record<string, unknown>;
    delete legacy.venmoHandle;
    expect(leagueSettingsSchema.parse(legacy).venmoHandle).toBeNull();
  });
});

describe("DEFAULT_ROSTER_SLOTS", () => {
  it("is the spec's fixed v1 shape, ordered", () => {
    expect(DEFAULT_ROSTER_SLOTS.map((s) => s.slot)).toEqual([
      "QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DST",
    ]);
  });
});
