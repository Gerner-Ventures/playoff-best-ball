import { z } from "zod";

// One raw stat line per player per playoff week, stored ONCE in PlayerStat.stats.
// Fantasy points are computed per league from this + the league's ScoringSettings.
// Field names deliberately match the prototype's PlayerStats (see the port in
// src/domain/scoring/compute-points.ts) so the ESPN parser port maps 1:1.
// Two deliberate divergences from legacy: `interceptions` → `defInterceptions`
// (mirrors the scoring setting name), and fgMade/fgMissed hold plain distance
// numbers, not {distance} objects — the ESPN parser port must map both.

const n = z.number().finite().default(0);

export const statLineSchema = z.object({
  // passing
  passYards: n,
  passTd: n,
  passInt: n,
  // rushing
  rushYards: n,
  rushTd: n,
  // receiving
  recYards: n,
  recTd: n,
  receptions: n,
  // kicking — distances in yards, one entry per attempt
  fgMade: z.array(z.number().finite()).default([]),
  fgMissed: z.array(z.number().finite()).default([]),
  xpMade: n,
  xpMissed: n,
  // defense/special teams (DST pseudo-players)
  sacks: n,
  defInterceptions: n,
  fumblesRecovered: n,
  defensiveTd: n,
  safeties: n,
  blockedKicks: n,
  /** Opponent points scored against the DST; null for non-DST players. */
  pointsAllowed: z.number().finite().nullable().default(null),
  // misc
  twoPtConv: n,
  fumblesLost: n,
  returnTd: n,
});

export type StatLine = z.infer<typeof statLineSchema>;

export function emptyStatLine(): StatLine {
  return statLineSchema.parse({});
}

/** Single entry point for reading PlayerStat.stats JSON. */
export function parseStatLine(json: unknown): StatLine {
  return statLineSchema.parse(json);
}

/** safeParse variant for surfaces that must degrade gracefully. */
export function tryParseStatLine(json: unknown): StatLine | null {
  const result = statLineSchema.safeParse(json);
  return result.success ? result.data : null;
}
