export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

export type RosterSlot = "QB" | "RB1" | "RB2" | "WR1" | "WR2" | "TE" | "FLEX" | "K" | "DST";

export interface ScoringRules {
  // Passing
  passYardsPerPoint: number;
  passTd: number;
  passInt: number;
  // Rushing
  rushYardsPerPoint: number;
  rushTd: number;
  // Receiving
  recYardsPerPoint: number;
  recTd: number;
  ppr: number;
  // Misc Offense
  twoPtConv: number;
  fumbleLost: number;
  returnTd: number;
  offFumRetTd: number;
  // Kicking - Made FGs
  fg0_19: number;
  fg20_29: number;
  fg30_39: number;
  fg40_49: number;
  fg50Plus: number;
  // Kicking - Missed FGs (only 0-39 yards penalized)
  fgMiss0_39: number;
  xpMade: number;
  xpMiss: number;
  // Defense/Special Teams
  sack: number;
  defInt: number;
  fumRec: number;
  dstTd: number;
  safety: number;
  block: number;
  xpReturned: number;
  // Points Allowed
  pa0: number;
  pa1_6: number;
  pa7_13: number;
  pa14_20: number;
  pa21_27: number;
  pa28_34: number;
  pa35Plus: number;
}

export interface PlayerStats {
  passYards: number;
  passTd: number;
  passInt: number;
  rushYards: number;
  rushTd: number;
  recYards: number;
  recTd: number;
  receptions: number;
  twoPtConv: number;
  fumblesLost: number;
  returnTd: number;
  // Kicking
  fgMade: { distance: number }[];
  fgMissed: { distance: number }[];
  xpMade: number;
  xpMissed: number;
  // Defense
  sacks: number;
  interceptions: number;
  fumblesRecovered: number;
  defensiveTd: number;
  safeties: number;
  blockedKicks: number;
  pointsAllowed: number;
}

export interface PlayerWithScore {
  id: string;
  name: string;
  position: Position;
  team: string | null;
  totalPoints: number;
  weeklyScores: { week: number; points: number }[];
}

export interface OwnerWithRoster {
  id: string;
  name: string;
  roster: {
    slot: RosterSlot;
    player: PlayerWithScore;
  }[];
  totalPoints: number;
  bestBallPoints: number;
}

export interface LeaderboardEntry {
  rank: number;
  owner: {
    id: string;
    name: string;
  };
  totalPoints: number;
  bestBallPoints: number;
}

// ESPN API Types
export interface ESPNEvent {
  id: string;
  name: string;
  competitions: ESPNCompetition[];
}

export interface ESPNCompetition {
  id: string;
  competitors: ESPNCompetitor[];
}

export interface ESPNCompetitor {
  id: string;
  team: {
    id: string;
    displayName: string;
    abbreviation: string;
  };
  score: string;
}

export interface ESPNBoxscore {
  teams: ESPNTeamBoxscore[];
  players: ESPNPlayerSection[];
}

export interface ESPNTeamBoxscore {
  team: {
    id: string;
    displayName: string;
    abbreviation: string;
  };
  statistics: ESPNStatistic[];
}

export interface ESPNPlayerSection {
  team: {
    id: string;
  };
  statistics: ESPNPlayerCategory[];
}

export interface ESPNPlayerCategory {
  name: string;
  labels: string[];
  athletes: ESPNAthlete[];
}

export interface ESPNAthlete {
  athlete: {
    id: string;
    displayName: string;
    firstName?: string;
    lastName?: string;
  };
  stats: string[];
}

export interface ESPNStatistic {
  name: string;
  displayValue: string;
}

export interface ESPNScoringPlay {
  text: string;
  type?: {
    text: string;
  };
}

// Game and Playoff Types
export type GameState = "pre" | "in" | "post";

export interface GameTeam {
  abbreviation: string;
  displayName: string;
  score: number;
}

export interface GameStatus {
  state: GameState;
  completed: boolean;
  description: string;
  detail: string;
  displayClock?: string;
  period?: number;
}

export interface GamePlayer {
  playerId: string;
  playerName: string;
  position: string;
  team: string;
  ownerId: string;
  ownerName: string;
  rosterSlot: string;
  isEliminated: boolean;
  stats: {
    passYards?: number;
    passTd?: number;
    passInt?: number;
    rushYards?: number;
    rushTd?: number;
    recYards?: number;
    recTd?: number;
    receptions?: number;
    fumblesLost?: number;
  };
  points: number;
  // Substitution info for injured players
  hasSubstitution?: boolean;
  isInjured?: boolean;
  substitution?: {
    effectiveWeek: number;
    reason: string | null;
    substitutePlayer: {
      id: string;
      name: string;
      team: string | null;
    };
  } | null;
  // For substitute players
  isSubstitute?: boolean;
  originalPlayer?: {
    id: string;
    name: string;
    team: string | null;
  };
}

export interface PlayoffGame {
  eventId: string;
  week: number;
  name: string;
  shortName: string;
  date: string;
  status: GameStatus;
  homeTeam: GameTeam;
  awayTeam: GameTeam;
  players: GamePlayer[];
}

// Projection Types
export interface ProjectedStats {
  passYards?: number;
  passTd?: number;
  passInt?: number;
  rushYards?: number;
  rushTd?: number;
  recYards?: number;
  recTd?: number;
  receptions?: number;
  fgMade?: number;
  xpMade?: number;
  // Defense projections are harder, so we just project total points
  dstPoints?: number;
}

export interface ProjectionResult {
  projectedPoints: number;
  confidence: "high" | "medium" | "low";
  basis: "playoff_avg" | "position_avg" | "manual";
  gamesPlayed: number;
  breakdown?: ProjectedStats;
}

export interface TeamOddsData {
  team: string;
  opponent: string;
  winProb: number;
  moneyline?: number;
  gameTime?: Date;
}

export interface PlayerProjectionData {
  playerId: string;
  playerName: string;
  position: Position;
  team: string | null;
  week: number;
  projectedPoints: number;
  teamWinProb: number | null;
  expectedValue: number | null;
  confidence: "high" | "medium" | "low";
  basis: "playoff_avg" | "position_avg" | "manual";
}

export interface OwnerProjectionSummary {
  ownerId: string;
  ownerName: string;
  actualPoints: number;
  projectedRemainingPoints: number;
  expectedRemainingValue: number;
  totalExpectedValue: number;
  players: PlayerProjectionData[];
}

/**
 * Enhanced projection breakdown with full transparency
 * Shows sources, adjustments, confidence factors, and ranges
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
