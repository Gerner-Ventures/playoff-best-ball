import { Position, ScoringRules } from "@/types";
import { DEFAULT_SCORING_RULES } from "@/lib/scoring/rules";
import { PropType } from "@prisma/client";
import { GameWeatherData, getWeatherImpact } from "@/lib/weather/client";

/**
 * Prop-based projection data
 */
export interface PropProjection {
  passYards?: number; // From player_pass_yds line
  passTds?: number; // From player_pass_tds line
  rushYards?: number; // From player_rush_yds line
  recYards?: number; // From player_reception_yds line
  receptions?: number; // From player_receptions line
  tdProbability?: number; // From player_anytime_td (0-1)
}

/**
 * Weather adjustment multipliers by position
 */
export const WEATHER_MULTIPLIERS: Record<
  Position,
  Record<"high" | "medium" | "low" | "none", number>
> = {
  QB: { high: 0.85, medium: 0.92, low: 0.97, none: 1.0 },
  K: { high: 0.75, medium: 0.88, low: 0.95, none: 1.0 },
  WR: { high: 0.9, medium: 0.95, low: 0.98, none: 1.0 },
  TE: { high: 0.9, medium: 0.95, low: 0.98, none: 1.0 },
  RB: { high: 0.98, medium: 0.99, low: 1.0, none: 1.0 },
  DST: { high: 1.05, medium: 1.02, low: 1.0, none: 1.0 },
};

/**
 * Enhanced projection result with source tracking
 */
export interface EnhancedProjection {
  propProjectedPoints: number; // Points from props only
  historicalPoints: number; // Points from historical average
  blendedPoints: number; // Weighted blend
  expectedValue: number | null; // blendedPoints * winProb
  confidence: "high" | "medium" | "low";
  propCount: number; // Number of props used
  source: "prop" | "historical" | "blended";
}

/**
 * Configuration for projection blending
 */
export interface BlendConfig {
  propWeight: number; // Weight for prop-based projection (0-1)
  minGamesForHistorical: number; // Minimum games for historical to have weight
  minPropsForPropBased: number; // Minimum props needed to trust prop-based
}

const DEFAULT_BLEND_CONFIG: BlendConfig = {
  propWeight: 0.7, // 70% weight to prop-based projections
  minGamesForHistorical: 2,
  minPropsForPropBased: 2,
};

/**
 * Adaptive blending configuration - adjusts weights based on data quality
 */
export interface AdaptiveBlendConfig {
  basePropWeight: number;
  baseHistoricalWeight: number;
  propCountBonus: number; // Bonus per prop above minimum
  recencyBonus: number; // Bonus if props are recent (<24hrs)
  sampleSizePenalty: number; // Penalty if historical has few games
  maxPropWeight: number; // Cap on prop weight
  minPropWeight: number; // Floor on prop weight
}

const DEFAULT_ADAPTIVE_CONFIG: AdaptiveBlendConfig = {
  basePropWeight: 0.6,
  baseHistoricalWeight: 0.4,
  propCountBonus: 0.05, // +5% per prop above minimum
  recencyBonus: 0.1, // +10% for recent props
  sampleSizePenalty: 0.15, // -15% historical weight if < 2 games
  maxPropWeight: 0.9,
  minPropWeight: 0.3,
};

/**
 * Position-specific variance for projection ranges
 */
const POSITION_VARIANCE: Record<Position, number> = {
  QB: 6.5, // QBs have moderate variance
  RB: 8.0, // RBs have high variance (game script dependent)
  WR: 9.0, // WRs have highest variance (big play dependent)
  TE: 6.0, // TEs have moderate variance
  K: 4.0, // Kickers are relatively stable
  DST: 5.5, // DST has moderate variance
};

/**
 * Enhanced projection breakdown with full transparency
 */
export interface EnhancedProjectionBreakdown {
  // Final numbers
  projectedPoints: number;
  expectedValue: number | null;

  // Source contributions
  sources: {
    propBased: number | null;
    historicalAvg: number | null;
    propWeight: number;
    historicalWeight: number;
  };

  // Adjustments applied
  adjustments: {
    weather: {
      applied: boolean;
      impact: "high" | "medium" | "low" | "none";
      multiplier: number;
      conditions?: string;
    };
    recencyWeighting: boolean;
  };

  // Confidence factors
  confidence: {
    level: "high" | "medium" | "low";
    score: number; // 0-100
    factors: string[];
  };

  // Projection range
  range: {
    low: number;
    median: number;
    high: number;
  };

  // Props breakdown (if available)
  props?: {
    passYards?: { line: number; points: number };
    rushYards?: { line: number; points: number };
    recYards?: { line: number; points: number };
    receptions?: { line: number; points: number };
    anytimeTd?: { probability: number; points: number };
  };

  // Metadata
  dataFreshness: {
    propsUpdatedAt: string | null;
    historicalGamesCount: number;
  };
}

/**
 * Convert prop line values to projected fantasy points
 *
 * The idea: Prop lines represent the median expected outcome according to Vegas.
 * We use these lines directly as our projections.
 */
export function propsToFantasyPoints(
  props: PropProjection,
  position: Position,
  rules: ScoringRules = DEFAULT_SCORING_RULES
): number {
  let points = 0;

  // Passing
  if (props.passYards !== undefined) {
    points += props.passYards / rules.passYardsPerPoint;
  }
  if (props.passTds !== undefined) {
    points += props.passTds * rules.passTd;
  }

  // Rushing
  if (props.rushYards !== undefined) {
    points += props.rushYards / rules.rushYardsPerPoint;
  }

  // Receiving
  if (props.recYards !== undefined) {
    points += props.recYards / rules.recYardsPerPoint;
  }
  if (props.receptions !== undefined) {
    points += props.receptions * rules.ppr;
  }

  // TD probability (for non-QB positions where we have anytime TD)
  // Anytime TD includes rush TDs and receiving TDs
  // We only add this if we don't already have specific TD props
  if (props.tdProbability !== undefined && position !== "QB") {
    // Expected TD value = probability * TD points
    // Only add if we don't have pass TDs (which are QB-specific)
    points += props.tdProbability * rules.rushTd;
  }

  return roundToTwoDecimals(points);
}

/**
 * Convert a single prop line to fantasy points contribution
 */
export function propLineToPoints(
  propType: PropType,
  line: number,
  position: Position,
  rules: ScoringRules = DEFAULT_SCORING_RULES
): number {
  switch (propType) {
    case "PASS_YARDS":
      return line / rules.passYardsPerPoint;
    case "PASS_TDS":
      return line * rules.passTd;
    case "RUSH_YARDS":
      return line / rules.rushYardsPerPoint;
    case "REC_YARDS":
      return line / rules.recYardsPerPoint;
    case "RECEPTIONS":
      return line * rules.ppr;
    case "ANYTIME_TD":
      // Line here is actually the probability (0-1)
      // Only apply for non-QB positions
      if (position !== "QB") {
        return line * rules.rushTd;
      }
      return 0;
    default:
      return 0;
  }
}

/**
 * Blend prop-based projection with historical average
 */
export function blendProjections(
  propBased: number | null,
  historical: number | null,
  propCount: number,
  gamesPlayed: number,
  config: BlendConfig = DEFAULT_BLEND_CONFIG
): {
  blended: number;
  confidence: "high" | "medium" | "low";
  source: "prop" | "historical" | "blended";
} {
  // If we have no data, return 0
  if (propBased === null && historical === null) {
    return { blended: 0, confidence: "low", source: "historical" };
  }

  // If we only have historical, use that
  if (propBased === null || propBased === 0 || propCount < config.minPropsForPropBased) {
    return {
      blended: historical ?? 0,
      confidence: gamesPlayed >= config.minGamesForHistorical ? "medium" : "low",
      source: "historical",
    };
  }

  // If we only have props, use that
  if (historical === null || historical === 0 || gamesPlayed < config.minGamesForHistorical) {
    return {
      blended: propBased,
      confidence: propCount >= 3 ? "high" : "medium",
      source: "prop",
    };
  }

  // Blend both sources
  const blended = propBased * config.propWeight + historical * (1 - config.propWeight);

  // High confidence if we have good data from both sources
  const confidence: "high" | "medium" | "low" =
    propCount >= 3 && gamesPlayed >= config.minGamesForHistorical
      ? "high"
      : propCount >= 2 || gamesPlayed >= config.minGamesForHistorical
        ? "medium"
        : "low";

  return {
    blended: roundToTwoDecimals(blended),
    confidence,
    source: "blended",
  };
}

/**
 * Calculate expected value based on blended projection and win probability
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
 * Aggregate multiple props for a player into a single projection
 */
export function aggregatePlayerProps(
  props: { propType: PropType; line: number }[],
  position: Position,
  rules: ScoringRules = DEFAULT_SCORING_RULES
): { projection: PropProjection; points: number; propCount: number } {
  const projection: PropProjection = {};

  for (const prop of props) {
    switch (prop.propType) {
      case "PASS_YARDS":
        projection.passYards = prop.line;
        break;
      case "PASS_TDS":
        projection.passTds = prop.line;
        break;
      case "RUSH_YARDS":
        projection.rushYards = prop.line;
        break;
      case "REC_YARDS":
        projection.recYards = prop.line;
        break;
      case "RECEPTIONS":
        projection.receptions = prop.line;
        break;
      case "ANYTIME_TD":
        projection.tdProbability = prop.line; // Already stored as probability
        break;
    }
  }

  const points = propsToFantasyPoints(projection, position, rules);

  return {
    projection,
    points,
    propCount: props.length,
  };
}

/**
 * Estimate missing props based on position and available props
 * For example, if we have receiving yards but no receptions for a WR,
 * we can estimate receptions based on typical yards per reception
 */
export function estimateMissingProps(
  projection: PropProjection,
  position: Position
): PropProjection {
  const estimated = { ...projection };

  // Estimate receptions from receiving yards if missing (avg ~10 yards per reception)
  if (projection.recYards !== undefined && projection.receptions === undefined) {
    estimated.receptions = Math.round(projection.recYards / 10);
  }

  // For WRs/TEs with receiving yards, estimate TD probability if missing
  if (
    (position === "WR" || position === "TE") &&
    projection.recYards !== undefined &&
    projection.tdProbability === undefined
  ) {
    // Rough heuristic: ~1 TD per 80-100 receiving yards for primary receivers
    estimated.tdProbability = Math.min(projection.recYards / 100, 0.8);
  }

  // For RBs with rushing yards, estimate TD probability if missing
  if (
    position === "RB" &&
    projection.rushYards !== undefined &&
    projection.tdProbability === undefined
  ) {
    // Rough heuristic: ~1 TD per 60-80 rushing yards
    estimated.tdProbability = Math.min(projection.rushYards / 70, 0.9);
  }

  return estimated;
}

/**
 * Get position-specific baseline projection when no props are available
 */
export function getPositionBaseline(position: Position): number {
  const baselines: Record<Position, number> = {
    QB: 18.5,
    RB: 12.0,
    WR: 11.5,
    TE: 8.0,
    K: 7.5,
    DST: 7.0,
  };
  return baselines[position];
}

/**
 * Round to two decimal places
 */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate adaptive blend weights based on data quality signals
 */
export function calculateAdaptiveWeights(
  propCount: number,
  gamesPlayed: number,
  propsUpdatedAt: Date | null,
  config: AdaptiveBlendConfig = DEFAULT_ADAPTIVE_CONFIG
): { propWeight: number; historicalWeight: number } {
  let propWeight = config.basePropWeight;

  // Boost prop weight for more props (up to +10% for 4+ props)
  if (propCount > 2) {
    propWeight += config.propCountBonus * Math.min(propCount - 2, 2);
  }

  // Boost prop weight if props are recent (within 24 hours)
  if (propsUpdatedAt) {
    const hoursSinceUpdate = (Date.now() - propsUpdatedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate < 24) {
      propWeight += config.recencyBonus;
    }
  }

  // Reduce historical weight if insufficient sample size
  if (gamesPlayed < 2) {
    propWeight += config.sampleSizePenalty;
  }

  // Clamp to valid range
  propWeight = Math.max(config.minPropWeight, Math.min(config.maxPropWeight, propWeight));

  return {
    propWeight: roundToTwoDecimals(propWeight),
    historicalWeight: roundToTwoDecimals(1 - propWeight),
  };
}

/**
 * Apply weather adjustment to projection
 */
export function applyWeatherAdjustment(
  baseProjection: number,
  position: Position,
  weather: GameWeatherData | null
): {
  adjustedProjection: number;
  multiplier: number;
  impact: "high" | "medium" | "low" | "none";
  conditions?: string;
} {
  if (!weather) {
    return { adjustedProjection: baseProjection, multiplier: 1.0, impact: "none" };
  }

  const weatherImpact = getWeatherImpact(weather);
  const multiplier = WEATHER_MULTIPLIERS[position][weatherImpact.level];
  const adjustedProjection = roundToTwoDecimals(baseProjection * multiplier);

  return {
    adjustedProjection,
    multiplier,
    impact: weatherImpact.level,
    conditions: weatherImpact.description,
  };
}

/**
 * Calculate confidence score and factors
 */
export function calculateConfidenceScore(
  propCount: number,
  gamesPlayed: number,
  propsUpdatedAt: Date | null,
  hasWeatherData: boolean
): { level: "high" | "medium" | "low"; score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  // Props contribution (max 40 points)
  if (propCount >= 4) {
    score += 40;
    factors.push(`${propCount} prop lines`);
  } else if (propCount >= 2) {
    score += 25;
    factors.push(`${propCount} prop lines`);
  } else if (propCount === 1) {
    score += 15;
    factors.push("1 prop line");
  }

  // Historical games contribution (max 30 points)
  if (gamesPlayed >= 3) {
    score += 30;
    factors.push(`${gamesPlayed} playoff games`);
  } else if (gamesPlayed >= 2) {
    score += 20;
    factors.push(`${gamesPlayed} playoff games`);
  } else if (gamesPlayed === 1) {
    score += 10;
    factors.push("1 playoff game");
  }

  // Recency bonus (max 15 points)
  if (propsUpdatedAt) {
    const hoursSinceUpdate = (Date.now() - propsUpdatedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate < 6) {
      score += 15;
      factors.push("Fresh prop data (<6h)");
    } else if (hoursSinceUpdate < 24) {
      score += 10;
      factors.push("Recent prop data (<24h)");
    } else {
      score += 5;
      factors.push("Older prop data");
    }
  }

  // Weather data bonus (max 15 points)
  if (hasWeatherData) {
    score += 15;
    factors.push("Weather adjusted");
  }

  // Determine level
  let level: "high" | "medium" | "low";
  if (score >= 70) {
    level = "high";
  } else if (score >= 40) {
    level = "medium";
  } else {
    level = "low";
  }

  return { level, score, factors };
}

/**
 * Calculate projection range (low/median/high)
 */
export function calculateProjectionRange(
  medianProjection: number,
  position: Position,
  confidence: "high" | "medium" | "low"
): { low: number; median: number; high: number } {
  const variance = POSITION_VARIANCE[position];

  // Adjust variance based on confidence
  const confidenceMultiplier = confidence === "high" ? 0.8 : confidence === "medium" ? 1.0 : 1.2;
  const adjustedVariance = variance * confidenceMultiplier;

  // 10th and 90th percentile approximation
  const low = roundToTwoDecimals(Math.max(0, medianProjection - adjustedVariance));
  const high = roundToTwoDecimals(medianProjection + adjustedVariance);

  return { low, median: roundToTwoDecimals(medianProjection), high };
}

/**
 * Calculate recency-weighted average of historical scores
 */
export function calculateRecencyWeightedAvg(
  scores: { week: number; points: number }[],
  decayFactor: number = 0.8
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
 * Advanced blend with adaptive weights and weather adjustments
 */
export function advancedBlendProjections(
  propProjection: {
    points: number | null;
    propCount: number;
    props?: PropProjection;
    updatedAt?: Date;
  },
  historicalData: {
    scores: { week: number; points: number }[];
  },
  position: Position,
  weather: GameWeatherData | null,
  winProbability: number | null
): EnhancedProjectionBreakdown {
  const gamesPlayed = historicalData.scores.length;
  const propCount = propProjection.propCount;
  const propsUpdatedAt = propProjection.updatedAt ?? null;

  // Calculate recency-weighted historical average
  const historicalAvg = calculateRecencyWeightedAvg(historicalData.scores);

  // Calculate adaptive weights
  const weights = calculateAdaptiveWeights(propCount, gamesPlayed, propsUpdatedAt);

  // Determine base projection
  let baseProjection: number;
  let source: "prop" | "historical" | "blended";

  if (propProjection.points !== null && propProjection.points > 0 && propCount >= 2) {
    if (gamesPlayed >= 2 && historicalAvg > 0) {
      // Blend both sources
      baseProjection =
        propProjection.points * weights.propWeight + historicalAvg * weights.historicalWeight;
      source = "blended";
    } else {
      // Props only
      baseProjection = propProjection.points;
      source = "prop";
    }
  } else if (historicalAvg > 0) {
    // Historical only
    baseProjection = historicalAvg;
    source = "historical";
  } else {
    // Fall back to position baseline
    baseProjection = getPositionBaseline(position);
    source = "historical";
  }

  // Apply weather adjustment
  const weatherAdj = applyWeatherAdjustment(baseProjection, position, weather);
  const projectedPoints = weatherAdj.adjustedProjection;

  // Calculate confidence
  const confidence = calculateConfidenceScore(
    propCount,
    gamesPlayed,
    propsUpdatedAt,
    weather !== null
  );

  // Calculate range
  const range = calculateProjectionRange(projectedPoints, position, confidence.level);

  // Calculate expected value
  const expectedValue =
    winProbability !== null ? roundToTwoDecimals(projectedPoints * winProbability) : null;

  // Build props breakdown if available
  let propsBreakdown: EnhancedProjectionBreakdown["props"] | undefined;
  if (propProjection.props) {
    propsBreakdown = {};
    const rules = DEFAULT_SCORING_RULES;
    if (propProjection.props.passYards !== undefined) {
      propsBreakdown.passYards = {
        line: propProjection.props.passYards,
        points: roundToTwoDecimals(propProjection.props.passYards / rules.passYardsPerPoint),
      };
    }
    if (propProjection.props.rushYards !== undefined) {
      propsBreakdown.rushYards = {
        line: propProjection.props.rushYards,
        points: roundToTwoDecimals(propProjection.props.rushYards / rules.rushYardsPerPoint),
      };
    }
    if (propProjection.props.recYards !== undefined) {
      propsBreakdown.recYards = {
        line: propProjection.props.recYards,
        points: roundToTwoDecimals(propProjection.props.recYards / rules.recYardsPerPoint),
      };
    }
    if (propProjection.props.receptions !== undefined) {
      propsBreakdown.receptions = {
        line: propProjection.props.receptions,
        points: roundToTwoDecimals(propProjection.props.receptions * rules.ppr),
      };
    }
    if (propProjection.props.tdProbability !== undefined) {
      propsBreakdown.anytimeTd = {
        probability: propProjection.props.tdProbability,
        points: roundToTwoDecimals(propProjection.props.tdProbability * rules.rushTd),
      };
    }
  }

  return {
    projectedPoints,
    expectedValue,
    sources: {
      propBased: propProjection.points,
      historicalAvg: historicalAvg > 0 ? historicalAvg : null,
      propWeight: source === "historical" ? 0 : source === "prop" ? 1 : weights.propWeight,
      historicalWeight:
        source === "prop" ? 0 : source === "historical" ? 1 : weights.historicalWeight,
    },
    adjustments: {
      weather: {
        applied: weatherAdj.multiplier !== 1.0,
        impact: weatherAdj.impact,
        multiplier: weatherAdj.multiplier,
        conditions: weatherAdj.conditions,
      },
      recencyWeighting: gamesPlayed > 0,
    },
    confidence,
    range,
    props: propsBreakdown,
    dataFreshness: {
      propsUpdatedAt: propsUpdatedAt?.toISOString() ?? null,
      historicalGamesCount: gamesPlayed,
    },
  };
}
