import { Position, ProjectionResult, ProjectedStats } from "@/types";
import { DEFAULT_SCORING_RULES } from "@/lib/scoring/rules";

interface PlayerWithScores {
  id: string;
  name: string;
  position: Position;
  team: string | null;
  scores: { week: number; points: number; breakdown?: Record<string, unknown> }[];
}

// Position average points per game (baseline projections when no data available)
// Based on typical playoff fantasy scoring
const POSITION_AVERAGES: Record<Position, number> = {
  QB: 18.5,
  RB: 12.0,
  WR: 11.5,
  TE: 8.0,
  K: 7.5,
  DST: 7.0,
};

// Minimum games for "high" confidence
const HIGH_CONFIDENCE_GAMES = 2;

// Recency weighting decay factor (20% decay per week)
const RECENCY_DECAY_FACTOR = 0.8;

/**
 * Calculate projected points for a player based on their playoff performance
 */
export function calculateProjection(player: PlayerWithScores): ProjectionResult {
  const validScores = player.scores.filter((s) => s.points > 0);
  const gamesPlayed = validScores.length;

  // No games played - use position average
  if (gamesPlayed === 0) {
    return {
      projectedPoints: POSITION_AVERAGES[player.position],
      confidence: "low",
      basis: "position_avg",
      gamesPlayed: 0,
    };
  }

  // Calculate average points per game
  const totalPoints = validScores.reduce((sum, s) => sum + s.points, 0);
  const avgPoints = totalPoints / gamesPlayed;

  // Determine confidence based on sample size
  let confidence: "high" | "medium" | "low";
  if (gamesPlayed >= HIGH_CONFIDENCE_GAMES) {
    confidence = "high";
  } else if (gamesPlayed === 1) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // Try to project individual stats if breakdown available
  const breakdown = projectStatsBreakdown(player, validScores);

  return {
    projectedPoints: roundToTwoDecimals(avgPoints),
    confidence,
    basis: "playoff_avg",
    gamesPlayed,
    breakdown,
  };
}

/**
 * Project individual stats based on average performance
 */
function projectStatsBreakdown(
  player: PlayerWithScores,
  scores: { breakdown?: Record<string, unknown> }[]
): ProjectedStats | undefined {
  // Only project if we have breakdown data
  const breakdowns = scores
    .map((s) => s.breakdown)
    .filter((b): b is Record<string, unknown> => !!b);

  if (breakdowns.length === 0) {
    return undefined;
  }

  const avgStats: ProjectedStats = {};
  const numGames = breakdowns.length;

  // Aggregate and average each stat type
  const statKeys = [
    "passYards",
    "passTd",
    "passInt",
    "rushYards",
    "rushTd",
    "recYards",
    "recTd",
    "receptions",
  ];

  for (const key of statKeys) {
    const total = breakdowns.reduce((sum, b) => {
      const val = b[key];
      return sum + (typeof val === "number" ? val : 0);
    }, 0);

    if (total > 0) {
      (avgStats as Record<string, number>)[key] = roundToTwoDecimals(total / numGames);
    }
  }

  return Object.keys(avgStats).length > 0 ? avgStats : undefined;
}

/**
 * Calculate expected value: projected points * win probability
 */
export function calculateExpectedValue(
  projectedPoints: number,
  winProbability: number | null
): number | null {
  if (winProbability === null) {
    return null;
  }
  return roundToTwoDecimals(projectedPoints * winProbability);
}

/**
 * Calculate projected points from projected stats
 */
export function calculatePointsFromStats(stats: ProjectedStats): number {
  const rules = DEFAULT_SCORING_RULES;
  let points = 0;

  // Passing
  if (stats.passYards) {
    points += stats.passYards / rules.passYardsPerPoint;
  }
  if (stats.passTd) {
    points += stats.passTd * rules.passTd;
  }
  if (stats.passInt) {
    points += stats.passInt * rules.passInt;
  }

  // Rushing
  if (stats.rushYards) {
    points += stats.rushYards / rules.rushYardsPerPoint;
  }
  if (stats.rushTd) {
    points += stats.rushTd * rules.rushTd;
  }

  // Receiving
  if (stats.recYards) {
    points += stats.recYards / rules.recYardsPerPoint;
  }
  if (stats.recTd) {
    points += stats.recTd * rules.recTd;
  }
  if (stats.receptions) {
    points += stats.receptions * rules.ppr;
  }

  // Kicking (simplified)
  if (stats.fgMade) {
    points += stats.fgMade * 3.5; // Average FG value
  }
  if (stats.xpMade) {
    points += stats.xpMade * rules.xpMade;
  }

  // DST (just use the direct points if provided)
  if (stats.dstPoints) {
    points += stats.dstPoints;
  }

  return roundToTwoDecimals(points);
}

/**
 * Get position average for players with no games
 */
export function getPositionAverage(position: Position): number {
  return POSITION_AVERAGES[position];
}

/**
 * Round to 2 decimal places
 */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Determine which playoff week we're projecting for
 * Week 1 = Wild Card, Week 2 = Divisional, Week 3 = Conference, Week 5 = Super Bowl
 */
export function getCurrentProjectionWeek(): number {
  // This would ideally check the current date and playoff schedule
  // For now, return the next upcoming week
  return 2; // Divisional round
}

/**
 * Get remaining playoff weeks for projections
 */
export function getRemainingWeeks(completedWeeks: number[]): number[] {
  const allWeeks = [1, 2, 3, 5];
  return allWeeks.filter((w) => !completedWeeks.includes(w));
}

/**
 * Calculate recency-weighted average of historical scores
 * More recent games are weighted more heavily using exponential decay
 */
export function calculateRecencyWeightedAverage(
  scores: { week: number; points: number }[],
  decayFactor: number = RECENCY_DECAY_FACTOR
): number {
  if (scores.length === 0) return 0;

  // Sort by week descending (most recent first)
  const sortedScores = [...scores].sort((a, b) => b.week - a.week);

  let weightedSum = 0;
  let totalWeight = 0;

  sortedScores.forEach((score, index) => {
    const weight = Math.pow(decayFactor, index);
    weightedSum += score.points * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? roundToTwoDecimals(weightedSum / totalWeight) : 0;
}

/**
 * Enhanced projection calculation using recency weighting
 */
export function calculateProjectionWithRecency(
  player: PlayerWithScores,
  useRecencyWeighting: boolean = true
): ProjectionResult & { recencyWeighted: boolean } {
  const validScores = player.scores.filter((s) => s.points > 0);
  const gamesPlayed = validScores.length;

  // No games played - use position average
  if (gamesPlayed === 0) {
    return {
      projectedPoints: POSITION_AVERAGES[player.position],
      confidence: "low",
      basis: "position_avg",
      gamesPlayed: 0,
      recencyWeighted: false,
    };
  }

  // Calculate average points - with or without recency weighting
  let avgPoints: number;
  if (useRecencyWeighting && gamesPlayed > 1) {
    avgPoints = calculateRecencyWeightedAverage(validScores);
  } else {
    const totalPoints = validScores.reduce((sum, s) => sum + s.points, 0);
    avgPoints = totalPoints / gamesPlayed;
  }

  // Determine confidence based on sample size
  let confidence: "high" | "medium" | "low";
  if (gamesPlayed >= HIGH_CONFIDENCE_GAMES) {
    confidence = "high";
  } else if (gamesPlayed === 1) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // Try to project individual stats if breakdown available
  const breakdown = projectStatsBreakdown(player, validScores);

  return {
    projectedPoints: roundToTwoDecimals(avgPoints),
    confidence,
    basis: "playoff_avg",
    gamesPlayed,
    breakdown,
    recencyWeighted: useRecencyWeighting && gamesPlayed > 1,
  };
}
