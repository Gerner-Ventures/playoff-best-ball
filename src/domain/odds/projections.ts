import type { PlayerPosition } from "@prisma/client";

// Ported from the prototype's projections calculator (POSITION_AVERAGES):
// playoff-typical per-game baselines when a player hasn't played yet this postseason.
export const POSITION_AVERAGES: Record<PlayerPosition, number> = {
  QB: 18.5,
  RB: 12.0,
  WR: 11.5,
  TE: 8.0,
  K: 7.5,
  DST: 7.0,
};

// Prototype's RECENCY_DECAY_FACTOR: 20% less weight per week older.
const RECENCY_DECAY = 0.8;

// Prototype's HIGH_CONFIDENCE_GAMES: ≥2 played games = high confidence.
const HIGH_CONFIDENCE_GAMES = 2;

export interface Projection {
  projectedPoints: number;
  confidence: "high" | "medium" | "low";
  gamesPlayed: number;
}

/** Recency-weighted per-game projection from this postseason's scores. */
export function projectPoints(
  position: PlayerPosition,
  games: { week: number; points: number }[],
): Projection {
  // Zero-point weeks mean "didn't really play" (inactive, garbage-time DNP): skip them.
  const played = games.filter((g) => g.points > 0);
  if (played.length === 0) {
    return { projectedPoints: POSITION_AVERAGES[position], confidence: "low", gamesPlayed: 0 };
  }
  const latest = Math.max(...played.map((g) => g.week));
  let weightSum = 0;
  let weighted = 0;
  for (const g of played) {
    const weight = Math.pow(RECENCY_DECAY, latest - g.week);
    weighted += g.points * weight;
    weightSum += weight;
  }
  return {
    projectedPoints: weighted / weightSum,
    confidence: played.length >= HIGH_CONFIDENCE_GAMES ? "high" : "medium",
    gamesPlayed: played.length,
  };
}
