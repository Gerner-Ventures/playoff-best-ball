import { z } from "zod";

const points = z.number().finite();
const divisor = z.number().finite().positive();

export const scoringSettingsSchema = z.object({
  passYardsPerPoint: divisor,
  passTd: points,
  passInt: points,
  rushYardsPerPoint: divisor,
  rushTd: points,
  recYardsPerPoint: divisor,
  recTd: points,
  ppr: points,
  twoPtConv: points,
  fumbleLost: points,
  returnTd: points,
  fg0_19: points,
  fg20_29: points,
  fg30_39: points,
  fg40_49: points,
  fg50Plus: points,
  fgMiss: points,
  xpMade: points,
  xpMiss: points,
  sack: points,
  defInt: points,
  fumRec: points,
  dstTd: points,
  safety: points,
  block: points,
  pa0: points,
  pa1_6: points,
  pa7_13: points,
  pa14_20: points,
  pa21_27: points,
  pa28_34: points,
  pa35Plus: points,
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

export const slotTypeSchema = z.enum(["QB", "RB", "WR", "TE", "K", "DST", "FLEX"]);
export const rosterSlotSchema = z.object({
  slot: slotTypeSchema, // FLEX is a slot type; eligibility rules arrive with the draft (Phase 2)
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
  /** Where members send dues (display only). No version bump: optional w/ default. */
  venmoHandle: z.string().max(40).nullable().default(null),
  maxEntries: z.number().int().positive(),
});
export type LeagueSettings = z.infer<typeof leagueSettingsSchema>;

/**
 * Single entry point for reading League.settings JSON. When settingsVersion 2
 * arrives, the v1→v2 upcast lives here and nowhere else.
 */
export function parseLeagueSettings(json: unknown): LeagueSettings {
  return leagueSettingsSchema.parse(json);
}

/** safeParse variant for surfaces that must degrade gracefully instead of throwing. */
export function tryParseLeagueSettings(json: unknown): LeagueSettings | null {
  const result = leagueSettingsSchema.safeParse(json);
  return result.success ? result.data : null;
}

export function buildDefaultSettings(
  preset: ScoringPresetName,
  pickClockHours: PickClockHours,
): LeagueSettings {
  // Copies, not references: callers may mutate settings before persisting.
  return {
    settingsVersion: 1,
    scoringPreset: preset,
    scoring: { ...SCORING_PRESETS[preset] },
    rosterSlots: DEFAULT_ROSTER_SLOTS.map((s) => ({ ...s })),
    pickClockHours,
    overnightPause: true,
    substitutionsEnabled: false,
    entryFeeCents: null,
    venmoHandle: null,
    maxEntries: FREE_TIER_MAX_ENTRIES,
  };
}
