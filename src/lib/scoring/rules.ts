import { ScoringRules } from "@/types";

/**
 * Default scoring rules - Half PPR league
 */
export const DEFAULT_SCORING_RULES: ScoringRules = {
  // Passing
  passYardsPerPoint: 30, // 30 yards per point
  passTd: 6,
  passInt: -2,

  // Rushing
  rushYardsPerPoint: 10, // 10 yards per point
  rushTd: 6,

  // Receiving (Half PPR)
  recYardsPerPoint: 10, // 10 yards per point
  recTd: 6,
  ppr: 0.5, // Half point per reception

  // Miscellaneous Offense
  twoPtConv: 2,
  fumbleLost: -2,
  returnTd: 6,
  offFumRetTd: 6, // Offensive fumble return TD

  // Kicking - Made Field Goals
  fg0_19: 3,
  fg20_29: 3,
  fg30_39: 3,
  fg40_49: 4,
  fg50Plus: 5,
  // Kicking - Missed Field Goals (only 0-39 yards penalized)
  fgMiss0_39: -1,
  xpMade: 1, // PAT Made
  xpMiss: -1, // PAT Missed

  // Defense/Special Teams
  sack: 1,
  defInt: 2, // Interception
  fumRec: 2, // Fumble Recovery
  dstTd: 6, // Defensive/ST Touchdown
  safety: 4,
  block: 2, // Blocked Kick
  xpReturned: 2, // Extra Point Returned

  // Points Allowed
  pa0: 10, // 0 points
  pa1_6: 7, // 1-6 points
  pa7_13: 4, // 7-13 points
  pa14_20: 1, // 14-20 points
  pa21_27: 0, // 21-27 points
  pa28_34: -1, // 28-34 points
  pa35Plus: -3, // 35+ points
};

/**
 * Get field goal points based on distance
 */
export function getFieldGoalPoints(
  distance: number,
  made: boolean,
  rules: ScoringRules = DEFAULT_SCORING_RULES
): number {
  if (made) {
    if (distance < 20) return rules.fg0_19;
    if (distance < 30) return rules.fg20_29;
    if (distance < 40) return rules.fg30_39;
    if (distance < 50) return rules.fg40_49;
    return rules.fg50Plus;
  } else {
    // Only penalize missed FGs under 40 yards
    if (distance < 40) return rules.fgMiss0_39;
    return 0; // No penalty for missing 40+ yard FGs
  }
}

/**
 * Get points allowed score for defense
 */
export function getPointsAllowedScore(
  pointsAllowed: number,
  rules: ScoringRules = DEFAULT_SCORING_RULES
): number {
  if (pointsAllowed === 0) return rules.pa0;
  if (pointsAllowed <= 6) return rules.pa1_6;
  if (pointsAllowed <= 13) return rules.pa7_13;
  if (pointsAllowed <= 20) return rules.pa14_20;
  if (pointsAllowed <= 27) return rules.pa21_27;
  if (pointsAllowed <= 34) return rules.pa28_34;
  return rules.pa35Plus;
}
