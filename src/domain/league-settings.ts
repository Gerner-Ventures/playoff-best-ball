import { z } from "zod";

export const scoringSettingsSchema = z.object({
  passYardsPerPoint: z.number(),
  passTd: z.number(),
  passInt: z.number(),
  rushYardsPerPoint: z.number(),
  rushTd: z.number(),
  recYardsPerPoint: z.number(),
  recTd: z.number(),
  ppr: z.number(),
  twoPtConv: z.number(),
  fumbleLost: z.number(),
  returnTd: z.number(),
  fg0_19: z.number(),
  fg20_29: z.number(),
  fg30_39: z.number(),
  fg40_49: z.number(),
  fg50Plus: z.number(),
  fgMiss: z.number(),
  xpMade: z.number(),
  xpMiss: z.number(),
  sack: z.number(),
  defInt: z.number(),
  fumRec: z.number(),
  dstTd: z.number(),
  safety: z.number(),
  block: z.number(),
  pa0: z.number(),
  pa1_6: z.number(),
  pa7_13: z.number(),
  pa14_20: z.number(),
  pa21_27: z.number(),
  pa28_34: z.number(),
  pa35Plus: z.number(),
});
export type ScoringSettings = z.infer<typeof scoringSettingsSchema>;

// Values carried over from the prototype's ScoringSettings defaults.
const BASE_SCORING: Omit<ScoringSettings, "ppr"> = {
  passYardsPerPoint: 30, passTd: 6, passInt: -2,
  rushYardsPerPoint: 10, rushTd: 6,
  recYardsPerPoint: 10, recTd: 6,
  twoPtConv: 2, fumbleLost: -2, returnTd: 6,
  fg0_19: 3, fg20_29: 3, fg30_39: 3, fg40_49: 4, fg50Plus: 5, fgMiss: -1,
  xpMade: 1, xpMiss: -1,
  sack: 1, defInt: 2, fumRec: 2, dstTd: 6, safety: 4, block: 2,
  pa0: 10, pa1_6: 7, pa7_13: 4, pa14_20: 1, pa21_27: 0, pa28_34: -1, pa35Plus: -3,
};

export const SCORING_PRESETS = {
  standard: { ...BASE_SCORING, ppr: 0 },
  half_ppr: { ...BASE_SCORING, ppr: 0.5 },
  full_ppr: { ...BASE_SCORING, ppr: 1 },
} satisfies Record<string, ScoringSettings>;

export const scoringPresetNameSchema = z.enum(["standard", "half_ppr", "full_ppr"]);
export type ScoringPresetName = z.infer<typeof scoringPresetNameSchema>;

export const positionSchema = z.enum(["QB", "RB", "WR", "TE", "K", "DST", "FLEX"]);
export const rosterSlotSchema = z.object({
  slot: positionSchema, // FLEX is a slot type; eligibility rules arrive with the draft (Phase 2)
});
export type RosterSlotDef = z.infer<typeof rosterSlotSchema>;

export const DEFAULT_ROSTER_SLOTS: RosterSlotDef[] = [
  { slot: "QB" }, { slot: "RB" }, { slot: "RB" }, { slot: "WR" }, { slot: "WR" },
  { slot: "TE" }, { slot: "FLEX" }, { slot: "K" }, { slot: "DST" },
];

export const pickClockHoursSchema = z.union([
  z.literal(2), z.literal(4), z.literal(8), z.literal(24),
]);
export type PickClockHours = z.infer<typeof pickClockHoursSchema>;

export const FREE_TIER_MAX_ENTRIES = 10;

export const leagueSettingsSchema = z.object({
  settingsVersion: z.literal(1),
  scoringPreset: z.union([scoringPresetNameSchema, z.literal("custom")]),
  scoring: scoringSettingsSchema,
  rosterSlots: z.array(rosterSlotSchema).min(1),
  pickClockHours: pickClockHoursSchema,
  overnightPause: z.boolean(),
  substitutionsEnabled: z.boolean(),
  entryFeeCents: z.number().int().nonnegative().nullable(), // display only, for dues tracking
  maxEntries: z.number().int().positive(),
});
export type LeagueSettings = z.infer<typeof leagueSettingsSchema>;

export function buildDefaultSettings(
  preset: ScoringPresetName,
  pickClockHours: PickClockHours,
): LeagueSettings {
  return {
    settingsVersion: 1,
    scoringPreset: preset,
    scoring: SCORING_PRESETS[preset],
    rosterSlots: DEFAULT_ROSTER_SLOTS,
    pickClockHours,
    overnightPause: true,
    substitutionsEnabled: false,
    entryFeeCents: null,
    maxEntries: FREE_TIER_MAX_ENTRIES,
  };
}
