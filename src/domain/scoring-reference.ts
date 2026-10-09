import { DEFAULT_ROSTER_SLOTS, SCORING_PRESETS, type ScoringSettings } from "./league-settings";
import { FLEX_ELIGIBLE } from "./draft/slot-assignment";

export interface ScoringRow {
  key: keyof ScoringSettings;
  label: string;
  standard: string;
  halfPpr: string;
  fullPpr: string;
}
export interface ScoringGroup {
  title: string;
  rows: ScoringRow[];
}

/**
 * Settings deliberately not shown. Blocked kicks are in the presets, but the stats
 * feed never populates them (src/lib/stats/espn-parse.ts), so listing "+2" would
 * promise points that can't happen.
 */
export const EXCLUDED_SCORING_KEYS: (keyof ScoringSettings)[] = ["block"];

const points = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const perYards = (n: number) => `1 per ${n} yds`;

function row(key: keyof ScoringSettings, label: string, format: (n: number) => string = points): ScoringRow {
  return {
    key,
    label,
    standard: format(SCORING_PRESETS.standard[key]),
    halfPpr: format(SCORING_PRESETS.half_ppr[key]),
    fullPpr: format(SCORING_PRESETS.full_ppr[key]),
  };
}

/** The scoring page's tables, read from the same presets the engine scores with. */
export function scoringReference(): ScoringGroup[] {
  return [
    {
      title: "Passing",
      rows: [row("passYardsPerPoint", "Passing yards", perYards), row("passTd", "Passing TD"), row("passInt", "Interception thrown")],
    },
    {
      title: "Rushing and receiving",
      rows: [
        row("rushYardsPerPoint", "Rushing yards", perYards),
        row("rushTd", "Rushing TD"),
        row("recYardsPerPoint", "Receiving yards", perYards),
        row("recTd", "Receiving TD"),
        row("ppr", "Reception"),
        row("twoPtConv", "2-point conversion"),
        row("fumbleLost", "Fumble lost"),
        row("returnTd", "Kick or punt return TD"),
      ],
    },
    {
      title: "Kicking",
      rows: [
        row("fg0_19", "Field goal, 0–19 yds"),
        row("fg20_29", "Field goal, 20–29 yds"),
        row("fg30_39", "Field goal, 30–39 yds"),
        row("fg40_49", "Field goal, 40–49 yds"),
        row("fg50Plus", "Field goal, 50+ yds"),
        row("fgMiss", "Missed field goal"),
        row("xpMade", "Extra point"),
        row("xpMiss", "Missed extra point"),
      ],
    },
    {
      title: "Defense / special teams",
      rows: [
        row("sack", "Sack"),
        row("defInt", "Interception"),
        row("fumRec", "Fumble recovery"),
        row("dstTd", "Defensive or return TD"),
        row("safety", "Safety"),
        row("pa0", "0 points allowed"),
        row("pa1_6", "1–6 points allowed"),
        row("pa7_13", "7–13 points allowed"),
        row("pa14_20", "14–20 points allowed"),
        row("pa21_27", "21–27 points allowed"),
        row("pa28_34", "28–34 points allowed"),
        row("pa35Plus", "35+ points allowed"),
      ],
    },
  ];
}

export function rosterReference(): string[] {
  return DEFAULT_ROSTER_SLOTS.map((s) => (s.slot === "FLEX" ? `FLEX (${FLEX_ELIGIBLE.join("/")})` : s.slot));
}
