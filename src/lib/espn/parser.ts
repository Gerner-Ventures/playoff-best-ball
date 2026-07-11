import {
  ESPNSummaryResponse,
  ESPNPlayerCategory,
  ESPNScoringPlay,
  ParsedPlayerStats,
  ParsedDefenseStats,
} from "./types";
import { DEFAULT_SCORING_RULES, getFieldGoalPoints, getPointsAllowedScore } from "../scoring/rules";
import { normalizeName, nameAppearsInText } from "../utils/names";

/**
 * Get a stat value from the labels/stats arrays
 */
function getStatValue(stats: string[], labels: string[], target: string): number {
  const idx = labels.indexOf(target);
  if (idx === -1) return 0;
  return parseFloat(stats[idx]) || 0;
}

/**
 * Parse XP stats from "made/attempted" format (e.g., "3/3")
 */
function parseXPStats(stats: string[], labels: string[]): { made: number; missed: number } {
  const xpIdx = labels.indexOf("XP");
  if (xpIdx === -1) return { made: 0, missed: 0 };

  const xpRaw = stats[xpIdx];
  const parts = xpRaw.split("/");
  const made = parseInt(parts[0]) || 0;
  const attempted = parts.length > 1 ? parseInt(parts[1]) : made;

  return { made, missed: attempted - made };
}

/**
 * Parse all player stats from a game summary
 */
export function parsePlayerStats(summary: ESPNSummaryResponse): Map<string, ParsedPlayerStats> {
  const statsMap = new Map<string, ParsedPlayerStats>();
  const box = summary.boxscore;

  if (!box?.players) return statsMap;

  // Build a map of team ID to team abbreviation from header
  const teamIdToAbbrev = new Map<string, string>();
  const competition = summary.header?.competitions?.[0];
  if (competition) {
    for (const competitor of competition.competitors) {
      teamIdToAbbrev.set(competitor.id, competitor.team.abbreviation);
    }
  }

  // Process each team's players
  for (const playerSection of box.players) {
    const teamAbbrev = teamIdToAbbrev.get(playerSection.team.id) || "";
    for (const category of playerSection.statistics) {
      processPlayerCategory(category, statsMap, teamAbbrev);
    }
  }

  // Process scoring plays for FGs and 2PT conversions
  if (summary.scoringPlays) {
    processScoringPlays(summary.scoringPlays, statsMap);
  }

  return statsMap;
}

/**
 * Process a category of player stats (passing, rushing, receiving, kicking)
 */
function processPlayerCategory(
  category: ESPNPlayerCategory,
  statsMap: Map<string, ParsedPlayerStats>,
  teamAbbrev: string
): void {
  const { name: catName, labels, athletes } = category;

  for (const athlete of athletes) {
    const playerName = athlete.athlete.firstName
      ? `${athlete.athlete.firstName} ${athlete.athlete.lastName}`
      : athlete.athlete.displayName;

    const normalizedName = normalizeName(playerName);

    // Get or create player stats
    if (!statsMap.has(normalizedName)) {
      statsMap.set(normalizedName, {
        name: playerName,
        espnId: athlete.athlete.id,
        team: teamAbbrev,
        stats: {
          passYards: 0,
          passTd: 0,
          passInt: 0,
          rushYards: 0,
          rushTd: 0,
          recYards: 0,
          recTd: 0,
          receptions: 0,
          fumblesLost: 0,
          xpMade: 0,
          xpMissed: 0,
          twoPtConv: 0,
          fgPoints: 0,
        },
        totalPoints: 0,
      });
    }

    const playerStats = statsMap.get(normalizedName)!;
    const stats = athlete.stats;

    // Parse stats based on category
    switch (catName) {
      case "passing":
        playerStats.stats.passYards += getStatValue(stats, labels, "YDS");
        playerStats.stats.passTd += getStatValue(stats, labels, "TD");
        playerStats.stats.passInt += getStatValue(stats, labels, "INT");
        break;

      case "rushing":
        playerStats.stats.rushYards += getStatValue(stats, labels, "YDS");
        playerStats.stats.rushTd += getStatValue(stats, labels, "TD");
        playerStats.stats.fumblesLost += getStatValue(stats, labels, "FUM");
        break;

      case "receiving":
        playerStats.stats.recYards += getStatValue(stats, labels, "YDS");
        playerStats.stats.recTd += getStatValue(stats, labels, "TD");
        playerStats.stats.receptions += getStatValue(stats, labels, "REC");
        break;

      case "kicking":
        const xp = parseXPStats(stats, labels);
        playerStats.stats.xpMade += xp.made;
        playerStats.stats.xpMissed += xp.missed;
        break;
    }
  }
}

/**
 * Process scoring plays for field goals and 2-point conversions
 */
function processScoringPlays(
  plays: ESPNScoringPlay[],
  statsMap: Map<string, ParsedPlayerStats>
): void {
  for (const play of plays) {
    const text = play.text;
    const type = play.type?.text?.toLowerCase() ?? "";
    const simpleText = text.replace(/[^a-z0-9]/gi, "").toLowerCase();

    // Field Goals
    if (type.includes("field goal")) {
      processFieldGoal(text, simpleText, statsMap);
    }

    // 2-Point Conversions (can be hidden in touchdown play text)
    if (simpleText.includes("twopoint") || simpleText.includes("2pt")) {
      processTwoPointConversion(text, simpleText, statsMap);
    }
  }
}

/**
 * Process a field goal scoring play
 */
function processFieldGoal(
  text: string,
  simpleText: string,
  statsMap: Map<string, ParsedPlayerStats>
): void {
  // Extract distance
  const distMatch =
    text.match(/(\d+)[\s-]*(?:y|yard|yds)/i) ||
    text.match(/(\d+)\s*FG/i) ||
    text.match(/\((\d+)\)/);
  const distance = distMatch ? parseInt(distMatch[1]) : 0;

  // Check if made or missed
  const isGood = !/no good|missed|blocked/i.test(text);
  const points = getFieldGoalPoints(distance, isGood);

  // Find the kicker in the text
  for (const [, player] of statsMap.entries()) {
    if (nameAppearsInText(player.name, text)) {
      player.stats.fgPoints += points;
      break;
    }
  }
}

/**
 * Process a 2-point conversion
 */
function processTwoPointConversion(
  text: string,
  simpleText: string,
  statsMap: Map<string, ParsedPlayerStats>
): void {
  // Check for failure
  const isFailed = /fail|incomplete|no good|intercepted/i.test(text);
  if (isFailed) return;

  // Award 2 points to all players mentioned in the play
  // e.g., "Caleb Williams Pass to Colston Loveland" -> both get points
  for (const [, player] of statsMap.entries()) {
    if (nameAppearsInText(player.name, text)) {
      player.stats.twoPtConv += 1;
    }
  }
}

/**
 * Parse defense/special teams stats from a game summary
 */
export function parseDefenseStats(summary: ESPNSummaryResponse): Map<string, ParsedDefenseStats> {
  const defenseMap = new Map<string, ParsedDefenseStats>();
  const box = summary.boxscore;

  if (!box?.teams) return defenseMap;

  for (const teamData of box.teams) {
    const team = teamData.team;

    // Find opponent data
    const opponentData = box.teams.find((t) => t.team.id !== team.id);
    const opponentStats = opponentData?.statistics ?? [];

    // Helper to get opponent stat
    const getOppStat = (name: string): string => {
      const stat = opponentStats.find((s) => s.name === name);
      return stat?.displayValue ?? "0";
    };

    // Get points allowed from header
    const competition = summary.header.competitions[0];
    const opponentComp = competition.competitors.find((c) => c.id !== team.id);
    const rawPointsAllowed = opponentComp ? parseInt(opponentComp.score) : NaN;

    // Skip this defense if we can't get valid score data (game hasn't started)
    if (isNaN(rawPointsAllowed)) {
      continue;
    }
    const pointsAllowed = rawPointsAllowed;

    // Parse defensive stats
    const sacksRaw = getOppStat("sacksYardsLost");
    const sacks = parseInt(sacksRaw.split("-")[0]) || 0;
    const interceptions = parseInt(getOppStat("interceptions")) || 0;
    const fumblesRecovered = parseInt(getOppStat("fumblesLost")) || 0;

    // Get own team stats for TDs and safeties
    const ownStats = teamData.statistics ?? [];
    const getOwnStat = (name: string): number => {
      const stat = ownStats.find((s) => s.name === name);
      return parseFloat(stat?.displayValue ?? "0");
    };

    const defensiveTd = getOwnStat("defensiveTouchdowns");
    const safeties = getOwnStat("safeties");

    // Calculate total points
    const totalPoints =
      getPointsAllowedScore(pointsAllowed) +
      sacks * DEFAULT_SCORING_RULES.sack +
      interceptions * DEFAULT_SCORING_RULES.defInt +
      fumblesRecovered * DEFAULT_SCORING_RULES.fumRec +
      defensiveTd * DEFAULT_SCORING_RULES.dstTd +
      safeties * DEFAULT_SCORING_RULES.safety;

    // Store under both full name and abbreviation
    const defenseStats: ParsedDefenseStats = {
      teamName: team.displayName,
      abbreviation: team.abbreviation,
      stats: {
        sacks,
        interceptions,
        fumblesRecovered,
        defensiveTd,
        safeties,
        pointsAllowed,
      },
      totalPoints,
    };

    defenseMap.set(normalizeName(team.displayName), defenseStats);
    defenseMap.set(normalizeName(team.abbreviation), defenseStats);
    // Also store as "TEAM DST" format
    defenseMap.set(normalizeName(`${team.abbreviation} DST`), defenseStats);
  }

  return defenseMap;
}

/**
 * Calculate total points for all parsed player stats
 */
export function calculateTotalPoints(statsMap: Map<string, ParsedPlayerStats>): void {
  const rules = DEFAULT_SCORING_RULES;

  for (const [, player] of statsMap) {
    const s = player.stats;

    player.totalPoints =
      // Passing
      s.passYards / rules.passYardsPerPoint +
      s.passTd * rules.passTd +
      s.passInt * rules.passInt +
      // Rushing
      s.rushYards / rules.rushYardsPerPoint +
      s.rushTd * rules.rushTd +
      // Receiving
      s.recYards / rules.recYardsPerPoint +
      s.recTd * rules.recTd +
      s.receptions * rules.ppr +
      // Kicking
      s.xpMade * rules.xpMade +
      s.xpMissed * rules.xpMiss +
      s.fgPoints +
      // Misc
      s.twoPtConv * rules.twoPtConv +
      s.fumblesLost * rules.fumbleLost;
  }
}

/**
 * Merge player stats from multiple games
 */
export function mergePlayerStats(
  ...statsMaps: Map<string, ParsedPlayerStats>[]
): Map<string, ParsedPlayerStats> {
  const merged = new Map<string, ParsedPlayerStats>();

  for (const statsMap of statsMaps) {
    for (const [key, player] of statsMap) {
      if (!merged.has(key)) {
        merged.set(key, { ...player });
      } else {
        const existing = merged.get(key)!;
        existing.stats.passYards += player.stats.passYards;
        existing.stats.passTd += player.stats.passTd;
        existing.stats.passInt += player.stats.passInt;
        existing.stats.rushYards += player.stats.rushYards;
        existing.stats.rushTd += player.stats.rushTd;
        existing.stats.recYards += player.stats.recYards;
        existing.stats.recTd += player.stats.recTd;
        existing.stats.receptions += player.stats.receptions;
        existing.stats.fumblesLost += player.stats.fumblesLost;
        existing.stats.xpMade += player.stats.xpMade;
        existing.stats.xpMissed += player.stats.xpMissed;
        existing.stats.twoPtConv += player.stats.twoPtConv;
        existing.stats.fgPoints += player.stats.fgPoints;
        existing.totalPoints += player.totalPoints;
      }
    }
  }

  return merged;
}

/**
 * Merge defense stats from multiple games
 */
export function mergeDefenseStats(
  ...statsMaps: Map<string, ParsedDefenseStats>[]
): Map<string, ParsedDefenseStats> {
  const merged = new Map<string, ParsedDefenseStats>();

  for (const statsMap of statsMaps) {
    for (const [key, defense] of statsMap) {
      if (!merged.has(key)) {
        merged.set(key, { ...defense });
      } else {
        const existing = merged.get(key)!;
        existing.stats.sacks += defense.stats.sacks;
        existing.stats.interceptions += defense.stats.interceptions;
        existing.stats.fumblesRecovered += defense.stats.fumblesRecovered;
        existing.stats.defensiveTd += defense.stats.defensiveTd;
        existing.stats.safeties += defense.stats.safeties;
        // Points allowed is cumulative across games
        existing.totalPoints += defense.totalPoints;
      }
    }
  }

  return merged;
}
