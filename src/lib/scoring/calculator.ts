import { PlayerStats, ScoringRules } from "@/types";
import { DEFAULT_SCORING_RULES, getFieldGoalPoints, getPointsAllowedScore } from "./rules";

export interface ScoreBreakdown {
  passing: number;
  rushing: number;
  receiving: number;
  kicking: number;
  defense: number;
  misc: number;
  total: number;
}

/**
 * Calculate fantasy points for a player based on their stats
 */
export function calculatePoints(
  stats: Partial<PlayerStats>,
  rules: ScoringRules = DEFAULT_SCORING_RULES
): ScoreBreakdown {
  const breakdown: ScoreBreakdown = {
    passing: 0,
    rushing: 0,
    receiving: 0,
    kicking: 0,
    defense: 0,
    misc: 0,
    total: 0,
  };

  // Passing
  if (stats.passYards) {
    breakdown.passing += stats.passYards / rules.passYardsPerPoint;
  }
  if (stats.passTd) {
    breakdown.passing += stats.passTd * rules.passTd;
  }
  if (stats.passInt) {
    breakdown.passing += stats.passInt * rules.passInt;
  }

  // Rushing
  if (stats.rushYards) {
    breakdown.rushing += stats.rushYards / rules.rushYardsPerPoint;
  }
  if (stats.rushTd) {
    breakdown.rushing += stats.rushTd * rules.rushTd;
  }

  // Receiving
  if (stats.recYards) {
    breakdown.receiving += stats.recYards / rules.recYardsPerPoint;
  }
  if (stats.recTd) {
    breakdown.receiving += stats.recTd * rules.recTd;
  }
  if (stats.receptions) {
    breakdown.receiving += stats.receptions * rules.ppr;
  }

  // Kicking
  if (stats.fgMade) {
    for (const fg of stats.fgMade) {
      breakdown.kicking += getFieldGoalPoints(fg.distance, true, rules);
    }
  }
  if (stats.fgMissed) {
    for (const fg of stats.fgMissed) {
      breakdown.kicking += getFieldGoalPoints(fg.distance, false, rules);
    }
  }
  if (stats.xpMade) {
    breakdown.kicking += stats.xpMade * rules.xpMade;
  }
  if (stats.xpMissed) {
    breakdown.kicking += stats.xpMissed * rules.xpMiss;
  }

  // Defense
  if (stats.sacks) {
    breakdown.defense += stats.sacks * rules.sack;
  }
  if (stats.interceptions) {
    breakdown.defense += stats.interceptions * rules.defInt;
  }
  if (stats.fumblesRecovered) {
    breakdown.defense += stats.fumblesRecovered * rules.fumRec;
  }
  if (stats.defensiveTd) {
    breakdown.defense += stats.defensiveTd * rules.dstTd;
  }
  if (stats.safeties) {
    breakdown.defense += stats.safeties * rules.safety;
  }
  if (stats.blockedKicks) {
    breakdown.defense += stats.blockedKicks * rules.block;
  }
  if (stats.pointsAllowed !== undefined) {
    breakdown.defense += getPointsAllowedScore(stats.pointsAllowed, rules);
  }

  // Miscellaneous
  if (stats.twoPtConv) {
    breakdown.misc += stats.twoPtConv * rules.twoPtConv;
  }
  if (stats.fumblesLost) {
    breakdown.misc += stats.fumblesLost * rules.fumbleLost;
  }
  if (stats.returnTd) {
    breakdown.misc += stats.returnTd * rules.returnTd;
  }

  // Total
  breakdown.total =
    breakdown.passing +
    breakdown.rushing +
    breakdown.receiving +
    breakdown.kicking +
    breakdown.defense +
    breakdown.misc;

  return breakdown;
}

/**
 * Round points to 2 decimal places
 */
export function roundPoints(points: number): number {
  return Math.round(points * 100) / 100;
}
