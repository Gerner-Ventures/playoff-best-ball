import type { ScoringSettings } from "../league-settings";
import type { StatLine } from "../stats/stat-line";

export interface ScoreBreakdown {
  passing: number;
  rushing: number;
  receiving: number;
  kicking: number;
  defense: number;
  misc: number;
  total: number;
}

function fieldGoalPoints(distance: number, made: boolean, s: ScoringSettings): number {
  if (!made) return s.fgMiss;
  if (distance <= 19) return s.fg0_19;
  if (distance <= 29) return s.fg20_29;
  if (distance <= 39) return s.fg30_39;
  if (distance <= 49) return s.fg40_49;
  return s.fg50Plus;
}

function pointsAllowedScore(pointsAllowed: number, s: ScoringSettings): number {
  if (pointsAllowed === 0) return s.pa0;
  if (pointsAllowed <= 6) return s.pa1_6;
  if (pointsAllowed <= 13) return s.pa7_13;
  if (pointsAllowed <= 20) return s.pa14_20;
  if (pointsAllowed <= 27) return s.pa21_27;
  if (pointsAllowed <= 34) return s.pa28_34;
  return s.pa35Plus;
}

/** Pure fantasy-point computation: one raw stat line × one league's scoring settings. */
export function computePoints(stats: StatLine, s: ScoringSettings): ScoreBreakdown {
  const passing =
    stats.passYards / s.passYardsPerPoint + stats.passTd * s.passTd + stats.passInt * s.passInt;
  const rushing = stats.rushYards / s.rushYardsPerPoint + stats.rushTd * s.rushTd;
  const receiving =
    stats.recYards / s.recYardsPerPoint + stats.recTd * s.recTd + stats.receptions * s.ppr;

  let kicking = stats.xpMade * s.xpMade + stats.xpMissed * s.xpMiss;
  for (const d of stats.fgMade) kicking += fieldGoalPoints(d, true, s);
  for (const d of stats.fgMissed) kicking += fieldGoalPoints(d, false, s);

  let defense =
    stats.sacks * s.sack +
    stats.defInterceptions * s.defInt +
    stats.fumblesRecovered * s.fumRec +
    stats.defensiveTd * s.dstTd +
    stats.safeties * s.safety +
    stats.blockedKicks * s.block;
  if (stats.pointsAllowed !== null) defense += pointsAllowedScore(stats.pointsAllowed, s);

  const misc =
    stats.twoPtConv * s.twoPtConv + stats.fumblesLost * s.fumbleLost + stats.returnTd * s.returnTd;

  const total = passing + rushing + receiving + kicking + defense + misc;
  return { passing, rushing, receiving, kicking, defense, misc, total };
}

// Number.EPSILON fixes IEEE-754 round-down artifacts at .xx5 boundaries (legacy
// lacked this, so outputs can differ from prototype history by 0.01 at such edges).
export function roundPoints(points: number): number {
  return Math.round((points + Number.EPSILON) * 100) / 100;
}
