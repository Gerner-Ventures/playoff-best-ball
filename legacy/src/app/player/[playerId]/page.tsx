import Link from "next/link";
import Image from "next/image";
import prisma from "@/lib/db";
import { ScoringBreakdown } from "@/components/scoring-breakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notFound } from "next/navigation";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { getEliminatedTeams } from "@/lib/espn/client";
import { Position } from "@/types";
import { advancedBlendProjections, aggregatePlayerProps } from "@/lib/props/calculator";
import { fetchStadiumWeather } from "@/lib/weather/client";
import { PropType } from "@prisma/client";

// Player headshot component
function PlayerHeadshot({
  espnId,
  playerName,
  size = 96,
}: {
  espnId?: string | null;
  playerName: string;
  size?: number;
}) {
  if (!espnId) {
    // Fallback placeholder
    return (
      <div
        className="bg-[rgba(255,255,255,0.1)] rounded-full flex items-center justify-center text-[var(--chalk-muted)]"
        style={{ width: size, height: size }}
      >
        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      </div>
    );
  }

  const headshotUrl = `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`;

  return (
    <Image
      src={headshotUrl}
      alt={playerName}
      width={size}
      height={size}
      className="rounded-full bg-[rgba(255,255,255,0.1)] object-cover"
      unoptimized
    />
  );
}

// Team logo component for server-side
function TeamLogoSmall({ abbreviation }: { abbreviation: string }) {
  const logoUrl = `https://a.espncdn.com/i/teamlogos/nfl/500/${abbreviation.toLowerCase()}.png`;
  return (
    <Image
      src={logoUrl}
      alt={`${abbreviation} logo`}
      width={24}
      height={24}
      className="object-contain"
      unoptimized
    />
  );
}

// Stats summary interface
interface StatsSummary {
  passYards: number;
  passTd: number;
  passInt: number;
  rushYards: number;
  rushTd: number;
  recYards: number;
  recTd: number;
  receptions: number;
  fumblesLost: number;
  fgMade: number;
  xpMade: number;
  sacks: number;
  interceptions: number;
  defensiveTd: number;
}

function aggregateStats(scores: { breakdown: unknown }[]): StatsSummary {
  const summary: StatsSummary = {
    passYards: 0,
    passTd: 0,
    passInt: 0,
    rushYards: 0,
    rushTd: 0,
    recYards: 0,
    recTd: 0,
    receptions: 0,
    fumblesLost: 0,
    fgMade: 0,
    xpMade: 0,
    sacks: 0,
    interceptions: 0,
    defensiveTd: 0,
  };

  for (const score of scores) {
    const breakdown = score.breakdown as Record<string, number> | null;
    if (!breakdown) continue;

    summary.passYards += breakdown.passYards || 0;
    summary.passTd += breakdown.passTd || 0;
    summary.passInt += breakdown.passInt || 0;
    summary.rushYards += breakdown.rushYards || 0;
    summary.rushTd += breakdown.rushTd || 0;
    summary.recYards += breakdown.recYards || 0;
    summary.recTd += breakdown.recTd || 0;
    summary.receptions += breakdown.receptions || 0;
    summary.fumblesLost += breakdown.fumblesLost || 0;
    summary.fgMade += breakdown.fgMade || 0;
    summary.xpMade += breakdown.xpMade || 0;
    summary.sacks += breakdown.sacks || 0;
    summary.interceptions += breakdown.interceptions || breakdown.defInt || 0;
    summary.defensiveTd += breakdown.defensiveTd || breakdown.dstTd || 0;
  }

  return summary;
}

// Stats section component
function StatsSection({
  position,
  scores,
}: {
  position: string;
  scores: { breakdown: unknown }[];
}) {
  const stats = aggregateStats(scores);
  const gamesPlayed = scores.filter((s) => s.breakdown).length;

  // Show different stats based on position
  const statItems: { label: string; value: string | number; highlight?: boolean }[] = [];

  if (position === "QB") {
    statItems.push(
      {
        label: "Pass Yards",
        value: stats.passYards.toLocaleString(),
        highlight: stats.passYards > 0,
      },
      { label: "Pass TD", value: stats.passTd, highlight: stats.passTd > 0 },
      { label: "INT", value: stats.passInt },
      { label: "Rush Yards", value: stats.rushYards, highlight: stats.rushYards > 0 },
      { label: "Rush TD", value: stats.rushTd, highlight: stats.rushTd > 0 }
    );
  } else if (position === "RB") {
    statItems.push(
      {
        label: "Rush Yards",
        value: stats.rushYards.toLocaleString(),
        highlight: stats.rushYards > 0,
      },
      { label: "Rush TD", value: stats.rushTd, highlight: stats.rushTd > 0 },
      { label: "Receptions", value: stats.receptions, highlight: stats.receptions > 0 },
      { label: "Rec Yards", value: stats.recYards, highlight: stats.recYards > 0 },
      { label: "Rec TD", value: stats.recTd, highlight: stats.recTd > 0 }
    );
  } else if (position === "WR" || position === "TE") {
    statItems.push(
      { label: "Receptions", value: stats.receptions, highlight: stats.receptions > 0 },
      { label: "Rec Yards", value: stats.recYards.toLocaleString(), highlight: stats.recYards > 0 },
      { label: "Rec TD", value: stats.recTd, highlight: stats.recTd > 0 },
      { label: "Rush Yards", value: stats.rushYards, highlight: stats.rushYards > 0 },
      { label: "Rush TD", value: stats.rushTd, highlight: stats.rushTd > 0 }
    );
  } else if (position === "K") {
    statItems.push(
      { label: "FG Made", value: stats.fgMade, highlight: stats.fgMade > 0 },
      { label: "XP Made", value: stats.xpMade, highlight: stats.xpMade > 0 }
    );
  } else if (position === "DST") {
    statItems.push(
      { label: "Sacks", value: stats.sacks, highlight: stats.sacks > 0 },
      { label: "INT", value: stats.interceptions, highlight: stats.interceptions > 0 },
      { label: "Def TD", value: stats.defensiveTd, highlight: stats.defensiveTd > 0 }
    );
  }

  // Filter out empty stats for cleaner display
  const filteredStats = statItems.filter((item) => item.value !== 0 && item.value !== "0");

  if (filteredStats.length === 0) return null;

  return (
    <div className="chalk-box p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[var(--chalk-white)]">Playoff Stats</h3>
        <span className="text-xs text-[var(--chalk-muted)]">
          {gamesPlayed} game{gamesPlayed !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {filteredStats.map((item) => (
          <div key={item.label} className="text-center">
            <div
              className={`text-xl sm:text-2xl font-bold ${item.highlight ? "text-[var(--chalk-green)]" : "text-[var(--chalk-white)]"}`}
            >
              {item.value}
            </div>
            <div className="text-[10px] sm:text-xs text-[var(--chalk-muted)] uppercase tracking-wide">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const WEEK_LABELS: Record<number, string> = {
  1: "Wild Card Round",
  2: "Divisional Round",
  3: "Conference Championships",
  5: "Super Bowl",
};

// Prop type labels
const PROP_LABELS: Record<string, string> = {
  PASS_YARDS: "Passing Yards",
  PASS_TDS: "Passing TDs",
  RUSH_YARDS: "Rushing Yards",
  REC_YARDS: "Receiving Yards",
  RECEPTIONS: "Receptions",
  ANYTIME_TD: "Anytime TD",
};

// Props section component
interface PlayerProp {
  propType: string;
  line: number;
  overOdds: number;
  underOdds: number;
  impliedOver: number;
  week: number;
  bookmaker: string | null;
}

// Projection section component
interface ProjectionSectionProps {
  projectedPoints: number;
  expectedValue: number | null;
  winProbability: number | null;
  opponent: string | null;
  confidence: "high" | "medium" | "low";
  source: string;
  propWeight: number;
  historicalWeight: number;
  propBasedPoints: number | null;
  historicalPoints: number | null;
  weatherImpact?: {
    applied: boolean;
    impact: string;
    multiplier: number;
    conditions?: string;
  };
  range: { low: number; median: number; high: number };
  gamesPlayed: number;
  propCount: number;
}

function ProjectionSection({
  projectedPoints,
  expectedValue,
  winProbability,
  opponent,
  confidence,
  source,
  propWeight,
  historicalWeight,
  propBasedPoints,
  historicalPoints,
  weatherImpact,
  range,
  gamesPlayed,
  propCount,
}: ProjectionSectionProps) {
  const confidenceColors = {
    high: "text-green-400",
    medium: "text-yellow-400",
    low: "text-red-400",
  };

  return (
    <div className="chalk-box p-4">
      <h3 className="text-sm font-bold text-[var(--chalk-white)] mb-3 flex items-center justify-between">
        <span>Projection & Expected Value</span>
        <span className={`text-xs font-normal ${confidenceColors[confidence]}`}>
          {confidence.charAt(0).toUpperCase() + confidence.slice(1)} Confidence
        </span>
      </h3>

      {/* Main projection numbers */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 bg-[rgba(0,0,0,0.2)] rounded-lg">
          <div className="text-xs text-[var(--chalk-muted)] mb-1">Projected</div>
          <div className="text-2xl font-bold text-[var(--chalk-yellow)]">
            {projectedPoints.toFixed(1)}
          </div>
          <div className="text-[10px] text-[var(--chalk-muted)]">pts</div>
        </div>
        <div className="text-center p-3 bg-[rgba(0,0,0,0.2)] rounded-lg">
          <div className="text-xs text-[var(--chalk-muted)] mb-1">Win Prob</div>
          <div className="text-2xl font-bold text-[var(--chalk-blue)]">
            {winProbability !== null ? `${Math.round(winProbability * 100)}%` : "-"}
          </div>
          {opponent && <div className="text-[10px] text-[var(--chalk-muted)]">vs {opponent}</div>}
        </div>
        <div className="text-center p-3 bg-[rgba(0,0,0,0.2)] rounded-lg">
          <div className="text-xs text-[var(--chalk-muted)] mb-1">Expected Value</div>
          <div className="text-2xl font-bold text-[var(--chalk-green)]">
            {expectedValue !== null ? expectedValue.toFixed(1) : "-"}
          </div>
          <div className="text-[10px] text-[var(--chalk-muted)]">proj &times; win%</div>
        </div>
      </div>

      {/* Projection range */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-[var(--chalk-muted)] mb-1">
          <span>Projection Range</span>
          <span>
            Low {range.low.toFixed(1)} - High {range.high.toFixed(1)}
          </span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/30 via-yellow-500/30 to-green-500/30" />
          <div
            className="absolute top-0 bottom-0 w-1 bg-[var(--chalk-yellow)]"
            style={{
              left: `${((projectedPoints - range.low) / (range.high - range.low)) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Source breakdown */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[var(--chalk-muted)]">Source Blend</span>
          <span className="text-[var(--chalk-white)]">
            {Math.round(propWeight * 100)}% props / {Math.round(historicalWeight * 100)}% historical
          </span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden flex">
          {propWeight > 0 && (
            <div
              className="h-full bg-[var(--chalk-blue)]"
              style={{ width: `${propWeight * 100}%` }}
            />
          )}
          {historicalWeight > 0 && (
            <div
              className="h-full bg-[var(--chalk-green)]"
              style={{ width: `${historicalWeight * 100}%` }}
            />
          )}
        </div>
        <div className="flex justify-between text-[10px] text-[var(--chalk-muted)] mt-1">
          <span>
            Props: {propBasedPoints?.toFixed(1) ?? "N/A"} pts ({propCount} lines)
          </span>
          <span>
            Historical: {historicalPoints?.toFixed(1) ?? "N/A"} pts ({gamesPlayed} games)
          </span>
        </div>
      </div>

      {/* Weather impact */}
      {weatherImpact && weatherImpact.applied && (
        <div className="flex items-center justify-between text-xs p-2 bg-yellow-900/20 border border-yellow-500/30 rounded">
          <span className="text-yellow-400">Weather Adjustment: {weatherImpact.impact} impact</span>
          <span className="text-[var(--chalk-muted)]">
            {Math.round((1 - weatherImpact.multiplier) * 100)}% reduction
            {weatherImpact.conditions && ` (${weatherImpact.conditions})`}
          </span>
        </div>
      )}

      {/* Methodology note */}
      <div className="mt-3 pt-3 border-t border-dashed border-[rgba(255,255,255,0.1)] text-[10px] text-[var(--chalk-muted)]">
        {source === "prop" && "Projection based primarily on Vegas betting prop lines."}
        {source === "historical" && "Projection based on playoff performance average."}
        {source === "blended" && "Projection blends Vegas props with playoff performance history."}
      </div>
    </div>
  );
}

function PropsSection({ props, weekLabel }: { props: PlayerProp[]; weekLabel?: string }) {
  if (props.length === 0) return null;

  // Group props by week
  const propsByWeek = props.reduce(
    (acc, prop) => {
      const week = prop.week;
      if (!acc[week]) acc[week] = [];
      acc[week].push(prop);
      return acc;
    },
    {} as Record<number, PlayerProp[]>
  );

  return (
    <div className="chalk-box p-4">
      <h3 className="text-sm font-bold text-[var(--chalk-white)] mb-3 flex items-center gap-2">
        <span>Betting Props</span>
        <span className="text-[10px] text-[var(--chalk-muted)] font-normal">from sportsbooks</span>
      </h3>
      <div className="space-y-4">
        {Object.entries(propsByWeek).map(([week, weekProps]) => (
          <div key={week}>
            <div className="text-xs text-[var(--chalk-blue)] mb-2">
              {WEEK_LABELS[parseInt(week)] || `Week ${week}`}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {weekProps.map((prop, idx) => {
                const label = PROP_LABELS[prop.propType] || prop.propType;
                const impliedPct = Math.round(prop.impliedOver * 100);
                return (
                  <div
                    key={`${prop.propType}-${idx}`}
                    className="flex items-center justify-between p-2 bg-[rgba(0,0,0,0.2)] rounded border border-[rgba(255,255,255,0.1)]"
                  >
                    <div>
                      <div className="text-xs text-[var(--chalk-muted)]">{label}</div>
                      <div className="text-sm font-bold text-[var(--chalk-white)]">
                        {prop.propType === "ANYTIME_TD" ? "Yes" : `O/U ${prop.line}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[var(--chalk-muted)]">Implied</div>
                      <div className="text-sm font-bold text-[var(--chalk-green)]">
                        {impliedPct}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-dashed border-[rgba(255,255,255,0.1)] text-[10px] text-[var(--chalk-muted)]">
        Lines from The Odds API. Implied probability shows likelihood of hitting the over.
      </div>
    </div>
  );
}

interface PlayerPageProps {
  params: Promise<{ playerId: string }>;
}

interface SubstitutionInfo {
  type: "injured" | "substitute";
  effectiveWeek: number;
  reason: string | null;
  linkedPlayer: {
    id: string;
    name: string;
    position: string;
    team: string | null;
  };
  ownerName: string;
}

// Determine current playoff week based on eliminated teams
function getCurrentPlayoffWeek(eliminatedCount: number): number {
  if (eliminatedCount < 6) return 1; // Wild Card
  if (eliminatedCount < 10) return 2; // Divisional
  if (eliminatedCount < 12) return 3; // Conference
  return 5; // Super Bowl
}

async function getPlayerData(playerId: string) {
  try {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        scores: {
          where: { year: CURRENT_SEASON_YEAR },
          orderBy: { week: "asc" },
        },
        rosters: {
          where: { year: CURRENT_SEASON_YEAR },
          include: { owner: true },
        },
        // Check if this player is the original (injured) player in a substitution
        substitutionsAsOriginal: {
          where: { year: CURRENT_SEASON_YEAR },
          include: {
            substitutePlayer: true,
            roster: { include: { owner: true } },
          },
        },
        // Check if this player is the substitute player
        substitutionsAsSubstitute: {
          where: { year: CURRENT_SEASON_YEAR },
          include: {
            originalPlayer: true,
            roster: { include: { owner: true } },
          },
        },
        // Player props for betting lines
        props: {
          where: { year: CURRENT_SEASON_YEAR },
          orderBy: [{ week: "asc" }, { propType: "asc" }],
        },
      },
    });

    return player;
  } catch (error) {
    console.error("Error fetching player:", error);
    return null;
  }
}

async function getTeamOdds(team: string, week: number) {
  try {
    const odds = await prisma.teamOdds.findFirst({
      where: {
        team: team.toUpperCase(),
        year: CURRENT_SEASON_YEAR,
        week,
      },
    });
    return odds;
  } catch (error) {
    console.error("Error fetching team odds:", error);
    return null;
  }
}

const positionBadgeClasses: Record<string, string> = {
  QB: "chalk-badge-qb",
  RB: "chalk-badge-rb",
  WR: "chalk-badge-wr",
  TE: "chalk-badge-te",
  K: "chalk-badge-k",
  DST: "chalk-badge-dst",
};

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { playerId } = await params;
  const player = await getPlayerData(playerId);

  if (!player) {
    notFound();
  }

  const totalPoints = player.scores.reduce((sum, s) => sum + s.points, 0);
  const owner = player.rosters[0]?.owner;
  const badgeClass = positionBadgeClasses[player.position] ?? "chalk-badge-flex";

  // Check if player's team is eliminated
  const eliminatedTeams = await getEliminatedTeams();
  const isEliminated = player.team ? eliminatedTeams.has(player.team.toUpperCase()) : false;

  // Check substitution status
  const isInjuredOriginal = player.substitutionsAsOriginal.length > 0;
  const isSubstitutePlayer = player.substitutionsAsSubstitute.length > 0;
  const injuredSubstitution = player.substitutionsAsOriginal[0];
  const substituteForSubstitution = player.substitutionsAsSubstitute[0];

  // Calculate enhanced projection if player is still active
  let projectionData: ReturnType<typeof advancedBlendProjections> | null = null;
  let teamOdds: Awaited<ReturnType<typeof getTeamOdds>> | null = null;
  let opponent: string | null = null;

  if (!isEliminated && !isInjuredOriginal && player.team) {
    // Determine current playoff week
    const currentWeek = getCurrentPlayoffWeek(eliminatedTeams.size);

    // Get team odds for this week
    teamOdds = await getTeamOdds(player.team, currentWeek);
    opponent = teamOdds?.opponent ?? null;

    // Get props for this week
    const currentWeekProps = player.props.filter((p) => p.week === currentWeek);

    // Aggregate props into projection
    const propData =
      currentWeekProps.length > 0
        ? aggregatePlayerProps(
            currentWeekProps.map((p) => ({ propType: p.propType, line: p.line })),
            player.position as Position
          )
        : { projection: {}, points: 0, propCount: 0 };

    // Get historical scores for recency-weighted average
    const historicalScores = player.scores.map((s) => ({
      week: s.week,
      points: s.points,
    }));

    // Fetch weather data if we have opponent info
    let weather: Awaited<ReturnType<typeof fetchStadiumWeather>> | null = null;
    if (opponent) {
      // Use game time from odds if available, else approximate to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const gameTime = teamOdds?.gameTime ?? tomorrow;
      // Higher seed usually hosts in playoffs, use opponent as home team assumption
      weather = await fetchStadiumWeather(opponent, gameTime);
    }

    // Calculate enhanced projection
    projectionData = advancedBlendProjections(
      {
        points: propData.points > 0 ? propData.points : null,
        propCount: propData.propCount,
        props: propData.projection,
        updatedAt: currentWeekProps[0]?.updatedAt ?? undefined,
      },
      { scores: historicalScores },
      player.position as Position,
      weather,
      teamOdds?.winProb ?? null
    );
  }

  return (
    <div className="space-y-6">
      {/* Injured Player Banner */}
      {isInjuredOriginal && injuredSubstitution && (
        <div className="bg-orange-900/30 border border-orange-500/50 rounded-lg p-4 flex items-start gap-3">
          <svg
            className="w-6 h-6 text-orange-400 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <div className="text-orange-400 font-bold">Injured - Out for Playoffs</div>
            <div className="text-orange-300 text-sm">
              {injuredSubstitution.reason
                ? `${player.name} is out due to: ${injuredSubstitution.reason}.`
                : `${player.name} has been ruled out for the remainder of the playoffs.`}{" "}
              Replaced by{" "}
              <Link
                href={`/player/${injuredSubstitution.substitutePlayer.id}`}
                className="text-blue-400 hover:underline font-medium"
              >
                {injuredSubstitution.substitutePlayer.name}
              </Link>{" "}
              starting from{" "}
              {WEEK_LABELS[injuredSubstitution.effectiveWeek] ||
                `Week ${injuredSubstitution.effectiveWeek}`}
              .
            </div>
            <div className="text-orange-300 text-xs mt-1">
              Owner: {injuredSubstitution.roster.owner.name}
            </div>
          </div>
        </div>
      )}

      {/* Substitute Player Banner */}
      {isSubstitutePlayer && substituteForSubstitution && (
        <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4 flex items-start gap-3">
          <svg
            className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <div className="text-blue-400 font-bold">Substitute Player</div>
            <div className="text-blue-300 text-sm">
              {player.name} is filling in for injured player{" "}
              <Link
                href={`/player/${substituteForSubstitution.originalPlayer.id}`}
                className="text-orange-400 hover:underline font-medium"
              >
                {substituteForSubstitution.originalPlayer.name}
              </Link>{" "}
              starting from{" "}
              {WEEK_LABELS[substituteForSubstitution.effectiveWeek] ||
                `Week ${substituteForSubstitution.effectiveWeek}`}
              .
            </div>
            <div className="text-blue-300 text-xs mt-1">
              Owner: {substituteForSubstitution.roster.owner.name}
            </div>
          </div>
        </div>
      )}

      {/* Elimination Banner */}
      {isEliminated && !isInjuredOriginal && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
          <svg
            className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <div className="text-red-400 font-bold">Team Eliminated</div>
            <div className="text-red-300 text-sm">
              {player.team} has been eliminated from the playoffs. This player will not score any
              additional points this season.
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-4 sm:gap-6">
        {/* Player Headshot */}
        <div className="flex-shrink-0">
          <PlayerHeadshot espnId={player.espnId} playerName={player.name} size={96} />
        </div>

        {/* Player Info */}
        <div className="flex-1 min-w-0">
          <Link
            href="/rosters"
            className="text-sm text-[var(--chalk-pink)] hover:underline mb-2 inline-block"
          >
            &larr; Back to Rosters
          </Link>
          <h1
            className={`text-2xl sm:text-3xl font-bold chalk-text truncate ${isEliminated ? "text-[var(--chalk-muted)]" : "text-[var(--chalk-yellow)]"}`}
          >
            {player.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
            <span
              className={`chalk-badge ${badgeClass} ${isEliminated || isInjuredOriginal ? "opacity-50" : ""}`}
            >
              {player.position}
            </span>
            {player.team && (
              <span
                className={`flex items-center gap-1.5 text-sm ${isEliminated ? "text-red-400" : "text-[var(--chalk-muted)]"}`}
              >
                <TeamLogoSmall abbreviation={player.team} />
                {player.team}
                {isEliminated && !isInjuredOriginal && (
                  <span className="ml-1 text-xs bg-red-900/50 px-1.5 py-0.5 rounded">OUT</span>
                )}
              </span>
            )}
            {isInjuredOriginal && (
              <span className="text-xs bg-orange-900/50 text-orange-400 px-1.5 py-0.5 rounded">
                INJ
              </span>
            )}
            {isSubstitutePlayer && (
              <span className="text-xs bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded">
                SUB
              </span>
            )}
            {owner && (
              <span className="text-sm text-[var(--chalk-muted)]">
                Owner: <span className="font-medium text-[var(--chalk-white)]">{owner.name}</span>
              </span>
            )}
          </div>
        </div>

        {/* Total Points */}
        <div className="text-right flex-shrink-0">
          <div className="text-sm text-[var(--chalk-muted)]">Total Points</div>
          <div
            className={`text-3xl sm:text-4xl font-bold chalk-score ${isEliminated ? "text-[var(--chalk-muted)]" : "text-[var(--chalk-green)]"}`}
          >
            {totalPoints.toFixed(1)}
          </div>
          {isEliminated && <div className="text-xs text-red-400 mt-1">Final</div>}
        </div>
      </div>

      {/* Stats Summary */}
      {player.scores.length > 0 && (
        <StatsSection position={player.position} scores={player.scores} />
      )}

      {/* Enhanced Projection */}
      {projectionData && (
        <ProjectionSection
          projectedPoints={projectionData.projectedPoints}
          expectedValue={projectionData.expectedValue}
          winProbability={teamOdds?.winProb ?? null}
          opponent={opponent}
          confidence={projectionData.confidence.level}
          source={
            projectionData.sources.propWeight === 1
              ? "prop"
              : projectionData.sources.historicalWeight === 1
                ? "historical"
                : "blended"
          }
          propWeight={projectionData.sources.propWeight}
          historicalWeight={projectionData.sources.historicalWeight}
          propBasedPoints={projectionData.sources.propBased}
          historicalPoints={projectionData.sources.historicalAvg}
          weatherImpact={projectionData.adjustments.weather}
          range={projectionData.range}
          gamesPlayed={projectionData.dataFreshness.historicalGamesCount}
          propCount={projectionData.props ? Object.keys(projectionData.props).length : 0}
        />
      )}

      {/* Player Props / Betting Lines */}
      {player.props && player.props.length > 0 && <PropsSection props={player.props} />}

      {/* Season Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Points by Round</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 5].map((week) => {
              const weekScore = player.scores.find((s) => s.week === week);
              return (
                <div
                  key={week}
                  className="text-center p-4 bg-[rgba(0,0,0,0.2)] rounded-lg border border-dashed border-[rgba(255,255,255,0.1)]"
                >
                  <div className="text-xs text-[var(--chalk-muted)] mb-1">{WEEK_LABELS[week]}</div>
                  <div
                    className={`text-2xl font-bold chalk-score ${
                      weekScore && weekScore.points > 0
                        ? "text-[var(--chalk-green)]"
                        : "text-[var(--chalk-muted)]"
                    }`}
                  >
                    {weekScore ? weekScore.points.toFixed(1) : "-"}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Game-by-Game Breakdowns */}
      <div>
        <h2 className="text-xl font-semibold text-[var(--chalk-white)] mb-4 chalk-text">
          Scoring Breakdown by Game
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 5].map((week) => {
            const weekScore = player.scores.find((s) => s.week === week);
            const breakdown = weekScore?.breakdown as Record<string, number> | null;

            return (
              <ScoringBreakdown
                key={week}
                playerName={player.name}
                week={week}
                weekLabel={WEEK_LABELS[week]}
                stats={breakdown ?? {}}
                totalPoints={weekScore?.points ?? 0}
              />
            );
          })}
        </div>
      </div>

      {/* Explanation */}
      <div className="chalk-box chalk-box-blue p-6">
        <h3 className="font-semibold text-[var(--chalk-blue)] mb-2 chalk-text">
          How Scoring Works
        </h3>
        <p className="text-sm text-[var(--chalk-white)]">
          Points are calculated from ESPN box score data. Each stat category has a specific point
          value (e.g., 1 point per 10 rushing yards, 6 points per TD). The breakdown above shows
          exactly how each point was earned. See the{" "}
          <Link href="/scoring" className="text-[var(--chalk-pink)] underline hover:no-underline">
            Scoring Rules
          </Link>{" "}
          page for the complete scoring system.
        </p>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
