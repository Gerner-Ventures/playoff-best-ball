import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { fetchScoreboard, fetchGameSummary, getEliminatedTeams } from "@/lib/espn/client";
import { parsePlayerStats, parseDefenseStats, calculateTotalPoints } from "@/lib/espn";
import {
  fetchStadiumWeather,
  getWeatherIcon,
  getWeatherImpact,
  type GameWeatherData,
} from "@/lib/weather/client";
import prisma from "@/lib/db";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { PropType } from "@prisma/client";

// Server-side team logo helper (simpler than client component for SSR)
function TeamLogoServer({ abbreviation, size = 48 }: { abbreviation: string; size?: number }) {
  const logoUrl = `https://a.espncdn.com/i/teamlogos/nfl/500/${abbreviation.toLowerCase()}.png`;
  return (
    <Image
      src={logoUrl}
      alt={`${abbreviation} logo`}
      width={size}
      height={size}
      className="object-contain"
      unoptimized
    />
  );
}

export const dynamic = "force-dynamic";

interface GamePlayer {
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
  // Substitution info
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
  isSubstitute?: boolean;
  originalPlayer?: {
    id: string;
    name: string;
    team: string | null;
  };
}

const POSITION_COLORS: Record<string, string> = {
  QB: "text-red-400",
  RB: "text-green-400",
  WR: "text-blue-400",
  TE: "text-yellow-400",
  K: "text-purple-400",
  DST: "text-orange-400",
  FLEX: "text-pink-400",
};

function StatChip({
  label,
  value,
  points,
  isNegative,
}: {
  label: string;
  value: string;
  points?: number;
  isNegative?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm ${
        isNegative
          ? "bg-red-900/30 text-red-400"
          : points && points > 0
            ? "bg-green-900/30 text-green-400"
            : "bg-[rgba(255,255,255,0.1)] text-[var(--chalk-muted)]"
      }`}
    >
      <span className="font-medium">{value}</span>
      <span className="opacity-70">{label}</span>
      {points !== undefined && (
        <span className="font-bold">
          {points >= 0 ? "+" : ""}
          {points.toFixed(1)}
        </span>
      )}
    </span>
  );
}

function PlayerCard({ player }: { player: GamePlayer }) {
  const posColor = POSITION_COLORS[player.position] || "text-[var(--chalk-white)]";
  const isInjured = player.isInjured;
  const isSubstitute = player.isSubstitute;

  // Build stat chips
  const statChips: React.ReactNode[] = [];

  if (player.stats.passYards) {
    statChips.push(
      <StatChip
        key="passYds"
        label="pass yds"
        value={String(player.stats.passYards)}
        points={player.stats.passYards / 30}
      />
    );
  }
  if (player.stats.passTd) {
    statChips.push(
      <StatChip
        key="passTd"
        label="TD"
        value={String(player.stats.passTd)}
        points={player.stats.passTd * 6}
      />
    );
  }
  if (player.stats.passInt) {
    statChips.push(
      <StatChip
        key="passInt"
        label="INT"
        value={String(player.stats.passInt)}
        points={player.stats.passInt * -2}
        isNegative
      />
    );
  }
  if (player.stats.rushYards) {
    statChips.push(
      <StatChip
        key="rushYds"
        label="rush yds"
        value={String(player.stats.rushYards)}
        points={player.stats.rushYards / 10}
      />
    );
  }
  if (player.stats.rushTd) {
    statChips.push(
      <StatChip
        key="rushTd"
        label="TD"
        value={String(player.stats.rushTd)}
        points={player.stats.rushTd * 6}
      />
    );
  }
  if (player.stats.receptions) {
    statChips.push(
      <StatChip
        key="rec"
        label="rec"
        value={String(player.stats.receptions)}
        points={player.stats.receptions * 0.5}
      />
    );
  }
  if (player.stats.recYards) {
    statChips.push(
      <StatChip
        key="recYds"
        label="rec yds"
        value={String(player.stats.recYards)}
        points={player.stats.recYards / 10}
      />
    );
  }
  if (player.stats.recTd) {
    statChips.push(
      <StatChip
        key="recTd"
        label="TD"
        value={String(player.stats.recTd)}
        points={player.stats.recTd * 6}
      />
    );
  }
  if (player.stats.fumblesLost) {
    statChips.push(
      <StatChip
        key="fumble"
        label="fumble"
        value={String(player.stats.fumblesLost)}
        points={player.stats.fumblesLost * -2}
        isNegative
      />
    );
  }

  return (
    <Link
      href={`/player/${player.playerId}`}
      className={`block p-4 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors border ${
        player.isEliminated
          ? "border-red-900/30 bg-red-900/10"
          : isInjured
            ? "border-orange-900/30 bg-orange-900/10"
            : isSubstitute
              ? "border-blue-900/30 bg-blue-900/10"
              : "border-transparent bg-[rgba(0,0,0,0.2)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className={`text-sm font-mono ${player.isEliminated || isInjured ? "opacity-50" : ""} ${player.isEliminated ? "text-red-400/50" : posColor}`}
            >
              {player.position}
            </span>
            <span
              className={`text-lg font-bold ${
                isInjured
                  ? "text-[var(--chalk-muted)] line-through"
                  : player.isEliminated
                    ? "text-[var(--chalk-muted)]"
                    : "text-[var(--chalk-white)]"
              }`}
            >
              {player.playerName}
            </span>
            {/* INJ badge for injured players */}
            {isInjured && (
              <span
                className="text-[8px] text-orange-400 bg-orange-900/30 px-1 py-0.5 rounded"
                title={player.substitution?.reason || "Injured - out for playoffs"}
              >
                INJ
              </span>
            )}
            {/* SUB badge for substitute players */}
            {isSubstitute && (
              <span
                className="text-[8px] text-blue-400 bg-blue-900/30 px-1 py-0.5 rounded"
                title={`Substitute for ${player.originalPlayer?.name}`}
              >
                SUB
              </span>
            )}
            {player.isEliminated && !isInjured && (
              <span className="text-[8px] text-red-400 bg-red-900/30 px-1 py-0.5 rounded">OUT</span>
            )}
          </div>
          <div className="text-sm text-[var(--chalk-muted)] mb-3">
            Rostered by <span className="text-[var(--chalk-white)]">{player.ownerName}</span>
            <span className="ml-2 text-xs">({player.rosterSlot})</span>
          </div>

          {/* Substitute info for injured player */}
          {isInjured && player.substitution && (
            <div className="mb-3 text-sm text-orange-300 flex items-center gap-2">
              <span className="text-[var(--chalk-muted)]">Replaced by:</span>
              <Link
                href={`/player/${player.substitution.substitutePlayer.id}`}
                className="text-[var(--chalk-blue)] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {player.substitution.substitutePlayer.name}
              </Link>
            </div>
          )}

          {/* Original player info for substitute */}
          {isSubstitute && player.originalPlayer && (
            <div className="mb-3 text-sm text-blue-300 flex items-center gap-2">
              <span className="text-[var(--chalk-muted)]">Filling in for:</span>
              <Link
                href={`/player/${player.originalPlayer.id}`}
                className="text-[var(--chalk-blue)] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {player.originalPlayer.name}
              </Link>
            </div>
          )}

          {player.isEliminated && !isInjured && !isSubstitute && (
            <div className="mb-3 text-sm text-red-400 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              Eliminated - No more points possible
            </div>
          )}

          {statChips.length > 0 && <div className="flex flex-wrap gap-2">{statChips}</div>}
          {statChips.length === 0 && !player.isEliminated && !isInjured && (
            <div className="text-sm text-[var(--chalk-muted)]">No stats yet</div>
          )}
        </div>

        <div className="text-right">
          <div
            className={`text-2xl font-bold ${
              player.isEliminated || isInjured
                ? "text-[var(--chalk-muted)]"
                : player.points > 0
                  ? "text-[var(--chalk-green)]"
                  : "text-[var(--chalk-muted)]"
            }`}
          >
            {player.points.toFixed(1)}
          </div>
          <div className="text-xs text-[var(--chalk-muted)]">pts</div>
        </div>
      </div>
    </Link>
  );
}

function formatQuarter(period?: number): string {
  if (!period) return "";
  if (period <= 4) return `Q${period}`;
  return `OT${period - 4 > 1 ? period - 4 : ""}`;
}

// Weather display component
function WeatherSection({ weather }: { weather: GameWeatherData | null }) {
  if (!weather) return null;

  const icon = getWeatherIcon(weather);
  const impact = getWeatherImpact(weather);

  const impactColors: Record<string, string> = {
    high: "text-red-400 bg-red-900/20 border-red-500/30",
    medium: "text-yellow-400 bg-yellow-900/20 border-yellow-500/30",
    low: "text-blue-300 bg-blue-900/20 border-blue-500/30",
    none: "text-[var(--chalk-muted)] bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]",
  };

  const colorClass = impactColors[impact.level] || impactColors.none;

  return (
    <div className={`rounded-lg border p-4 ${colorClass}`}>
      <div className="flex items-center gap-4">
        <div className="text-3xl">{icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-3 text-sm mb-1">
            {weather.isDome ? (
              <span className="font-medium">Dome Stadium</span>
            ) : (
              <>
                <span className="font-medium">{weather.temperature}°F</span>
                <span>|</span>
                <span>
                  Wind: {weather.windSpeed} mph {weather.windDirection}
                </span>
                <span>|</span>
                <span>{weather.condition}</span>
              </>
            )}
          </div>
          {!weather.isDome && (
            <div className="text-xs opacity-80">Fantasy Impact: {impact.description}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Team odds display component
interface TeamOddsData {
  team: string;
  opponent: string;
  winProb: number;
  moneyline: number | null;
}

function TeamOddsSection({
  awayTeam,
  homeTeam,
  awayOdds,
  homeOdds,
}: {
  awayTeam: string;
  homeTeam: string;
  awayOdds: TeamOddsData | null;
  homeOdds: TeamOddsData | null;
}) {
  if (!awayOdds && !homeOdds) return null;

  const awayWinProb = awayOdds?.winProb ?? (homeOdds ? 1 - homeOdds.winProb : 0.5);
  const homeWinProb = homeOdds?.winProb ?? (awayOdds ? 1 - awayOdds.winProb : 0.5);

  const formatMoneyline = (odds: number | null | undefined): string => {
    if (odds === null || odds === undefined) return "-";
    return odds > 0 ? `+${odds}` : String(odds);
  };

  return (
    <div className="chalk-box p-4">
      <h3 className="text-sm font-bold text-[var(--chalk-white)] mb-3 flex items-center gap-2">
        <span>Win Probability</span>
        <span className="text-[10px] text-[var(--chalk-muted)] font-normal">
          from betting lines
        </span>
      </h3>
      <div className="flex items-center gap-2">
        {/* Away team prob */}
        <div className="text-center flex-shrink-0 w-16">
          <div
            className={`text-xl font-bold ${awayWinProb > homeWinProb ? "text-[var(--chalk-green)]" : "text-[var(--chalk-white)]"}`}
          >
            {Math.round(awayWinProb * 100)}%
          </div>
          <div className="text-[10px] text-[var(--chalk-muted)]">
            {awayOdds?.moneyline ? formatMoneyline(awayOdds.moneyline) : ""}
          </div>
        </div>
        {/* Probability bar */}
        <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden flex">
          <div
            className={`h-full ${awayWinProb > homeWinProb ? "bg-[var(--chalk-green)]" : "bg-blue-500"}`}
            style={{ width: `${awayWinProb * 100}%` }}
          />
          <div
            className={`h-full ${homeWinProb > awayWinProb ? "bg-[var(--chalk-green)]" : "bg-red-500"}`}
            style={{ width: `${homeWinProb * 100}%` }}
          />
        </div>
        {/* Home team prob */}
        <div className="text-center flex-shrink-0 w-16">
          <div
            className={`text-xl font-bold ${homeWinProb > awayWinProb ? "text-[var(--chalk-green)]" : "text-[var(--chalk-white)]"}`}
          >
            {Math.round(homeWinProb * 100)}%
          </div>
          <div className="text-[10px] text-[var(--chalk-muted)]">
            {homeOdds?.moneyline ? formatMoneyline(homeOdds.moneyline) : ""}
          </div>
        </div>
      </div>
      <div className="flex justify-between text-xs text-[var(--chalk-muted)] mt-2">
        <span>{awayTeam}</span>
        <span>{homeTeam}</span>
      </div>
    </div>
  );
}

// Prop type labels
const PROP_LABELS: Record<string, string> = {
  PASS_YARDS: "Pass Yds",
  PASS_TDS: "Pass TDs",
  RUSH_YARDS: "Rush Yds",
  REC_YARDS: "Rec Yds",
  RECEPTIONS: "Rec",
  ANYTIME_TD: "TD Scorer",
};

// Player prop preview for pre-game
interface PlayerProp {
  propType: PropType;
  line: number;
  impliedOver: number;
}

function PlayerPropsPreview({ props }: { props: PlayerProp[] }) {
  if (props.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {props.slice(0, 3).map((prop, idx) => {
        const label = PROP_LABELS[prop.propType] || prop.propType;
        const value =
          prop.propType === "ANYTIME_TD"
            ? `${Math.round(prop.impliedOver * 100)}%`
            : `${prop.line}`;
        return (
          <span
            key={`${prop.propType}-${idx}`}
            className="text-[10px] px-1.5 py-0.5 bg-[var(--chalk-blue)]/20 text-[var(--chalk-blue)] rounded"
            title={`${label}: O/U ${prop.line} (${Math.round(prop.impliedOver * 100)}% over)`}
          >
            {label}: {value}
          </span>
        );
      })}
      {props.length > 3 && (
        <span className="text-[10px] px-1.5 py-0.5 bg-[rgba(255,255,255,0.1)] text-[var(--chalk-muted)] rounded">
          +{props.length - 3} more
        </span>
      )}
    </div>
  );
}

export default async function GamePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  // Find which week this game is in
  const weeks = [1, 2, 3, 5];
  let gameEvent = null;
  let gameWeek = 1;

  for (const week of weeks) {
    const events = await fetchScoreboard(week);
    const found = events.find((e) => e.id === eventId);
    if (found) {
      gameEvent = found;
      gameWeek = week;
      break;
    }
  }

  if (!gameEvent) {
    notFound();
  }

  const competition = gameEvent.competitions[0];
  if (!competition) {
    notFound();
  }

  const homeCompetitor = competition.competitors.find((c) => c.homeAway === "home");
  const awayCompetitor = competition.competitors.find((c) => c.homeAway === "away");

  if (!homeCompetitor || !awayCompetitor) {
    notFound();
  }

  // Get eliminated teams
  const eliminatedTeams = await getEliminatedTeams();

  // Fetch weather data for this game
  let weatherData: GameWeatherData | null = null;
  try {
    const gameTime = new Date(gameEvent.date);
    weatherData = await fetchStadiumWeather(homeCompetitor.team.abbreviation, gameTime);
  } catch (e) {
    console.warn("Could not fetch weather:", e);
  }

  // Fetch team odds for both teams
  const [awayTeamOdds, homeTeamOdds] = await Promise.all([
    prisma.teamOdds.findFirst({
      where: {
        team: awayCompetitor.team.abbreviation.toUpperCase(),
        year: CURRENT_SEASON_YEAR,
        week: gameWeek,
      },
    }),
    prisma.teamOdds.findFirst({
      where: {
        team: homeCompetitor.team.abbreviation.toUpperCase(),
        year: CURRENT_SEASON_YEAR,
        week: gameWeek,
      },
    }),
  ]);

  // Get rostered players with their scores and substitutions
  const rosters = await prisma.roster.findMany({
    where: { year: CURRENT_SEASON_YEAR },
    include: {
      player: {
        include: {
          scores: {
            where: { year: CURRENT_SEASON_YEAR },
          },
        },
      },
      owner: true,
      substitutions: {
        where: { year: CURRENT_SEASON_YEAR },
        include: {
          substitutePlayer: true,
        },
      },
    },
  });

  // Create lookup maps
  const playerRosterMap = new Map<
    string,
    {
      playerId: string;
      ownerId: string;
      ownerName: string;
      rosterSlot: string;
      position: string;
      team: string | null;
      hasSubstitution: boolean;
      substitution: {
        effectiveWeek: number;
        reason: string | null;
        substitutePlayer: {
          id: string;
          name: string;
          team: string | null;
        };
      } | null;
    }
  >();

  // Also create a map for substitute players
  const substitutePlayerMap = new Map<
    string,
    {
      playerId: string;
      ownerId: string;
      ownerName: string;
      rosterSlot: string;
      position: string;
      team: string | null;
      originalPlayer: {
        id: string;
        name: string;
        team: string | null;
      };
      effectiveWeek: number;
    }
  >();

  for (const roster of rosters) {
    const substitution = roster.substitutions[0]; // At most one per roster per year
    const hasSubstitution = !!substitution;

    const normalizedName = roster.player.name.toLowerCase().trim();
    playerRosterMap.set(normalizedName, {
      playerId: roster.player.id,
      ownerId: roster.owner.id,
      ownerName: roster.owner.name,
      rosterSlot: roster.rosterSlot,
      position: roster.player.position,
      team: roster.player.team,
      hasSubstitution,
      substitution: hasSubstitution
        ? {
            effectiveWeek: substitution.effectiveWeek,
            reason: substitution.reason,
            substitutePlayer: {
              id: substitution.substitutePlayer.id,
              name: substitution.substitutePlayer.name,
              team: substitution.substitutePlayer.team,
            },
          }
        : null,
    });

    // Add substitute player to the map too
    if (hasSubstitution) {
      const subNormalizedName = substitution.substitutePlayer.name.toLowerCase().trim();
      substitutePlayerMap.set(subNormalizedName, {
        playerId: substitution.substitutePlayer.id,
        ownerId: roster.owner.id,
        ownerName: roster.owner.name,
        rosterSlot: roster.rosterSlot,
        position: substitution.substitutePlayer.position,
        team: substitution.substitutePlayer.team,
        originalPlayer: {
          id: roster.player.id,
          name: roster.player.name,
          team: roster.player.team,
        },
        effectiveWeek: substitution.effectiveWeek,
      });
    }
  }

  const dstRosterMap = new Map<
    string,
    { playerId: string; ownerId: string; ownerName: string; rosterSlot: string }
  >();
  for (const roster of rosters) {
    if (roster.player.position === "DST" && roster.player.team) {
      dstRosterMap.set(roster.player.team.toUpperCase(), {
        playerId: roster.player.id,
        ownerId: roster.owner.id,
        ownerName: roster.owner.name,
        rosterSlot: roster.rosterSlot,
      });
    }
  }

  // Fetch game details
  const players: GamePlayer[] = [];
  const isLive = gameEvent.status.type.state === "in";
  const isCompleted = gameEvent.status.type.completed;
  const isScheduled = gameEvent.status.type.state === "pre";

  if (!isScheduled) {
    const summary = await fetchGameSummary(eventId);
    if (summary) {
      const playerStats = parsePlayerStats(summary);
      calculateTotalPoints(playerStats);

      const defenseStats = parseDefenseStats(summary);

      // Match players
      for (const [, player] of playerStats) {
        const normalizedName = player.name.toLowerCase().trim();
        const rosterInfo = playerRosterMap.get(normalizedName);
        const subInfo = substitutePlayerMap.get(normalizedName);

        if (rosterInfo) {
          const playerTeam = (player.team || "").toUpperCase();
          // Check if this original player is injured and week >= effectiveWeek
          const isInjured =
            rosterInfo.hasSubstitution && gameWeek >= rosterInfo.substitution!.effectiveWeek;

          players.push({
            playerId: rosterInfo.playerId,
            playerName: player.name,
            position: rosterInfo.position,
            team: player.team || "",
            ownerId: rosterInfo.ownerId,
            ownerName: rosterInfo.ownerName,
            rosterSlot: rosterInfo.rosterSlot,
            isEliminated: eliminatedTeams.has(playerTeam),
            stats: {
              passYards: player.stats.passYards || undefined,
              passTd: player.stats.passTd || undefined,
              passInt: player.stats.passInt || undefined,
              rushYards: player.stats.rushYards || undefined,
              rushTd: player.stats.rushTd || undefined,
              recYards: player.stats.recYards || undefined,
              recTd: player.stats.recTd || undefined,
              receptions: player.stats.receptions || undefined,
              fumblesLost: player.stats.fumblesLost || undefined,
            },
            points: player.totalPoints,
            isInjured,
            substitution: rosterInfo.substitution,
          });
        } else if (subInfo && gameWeek >= subInfo.effectiveWeek) {
          // This is a substitute player and we're in an active week for them
          const playerTeam = (player.team || subInfo.team || "").toUpperCase();
          players.push({
            playerId: subInfo.playerId,
            playerName: player.name,
            position: subInfo.position,
            team: player.team || "",
            ownerId: subInfo.ownerId,
            ownerName: subInfo.ownerName,
            rosterSlot: subInfo.rosterSlot,
            isEliminated: eliminatedTeams.has(playerTeam),
            stats: {
              passYards: player.stats.passYards || undefined,
              passTd: player.stats.passTd || undefined,
              passInt: player.stats.passInt || undefined,
              rushYards: player.stats.rushYards || undefined,
              rushTd: player.stats.rushTd || undefined,
              recYards: player.stats.recYards || undefined,
              recTd: player.stats.recTd || undefined,
              receptions: player.stats.receptions || undefined,
              fumblesLost: player.stats.fumblesLost || undefined,
            },
            points: player.totalPoints,
            isSubstitute: true,
            originalPlayer: subInfo.originalPlayer,
          });
        }
      }

      // Match defense stats
      for (const [key, defense] of defenseStats) {
        if (!key.includes("dst")) continue;
        const rosterInfo = dstRosterMap.get(defense.abbreviation.toUpperCase());
        if (rosterInfo) {
          players.push({
            playerId: rosterInfo.playerId,
            playerName: `${defense.teamName} DST`,
            position: "DST",
            team: defense.abbreviation,
            ownerId: rosterInfo.ownerId,
            ownerName: rosterInfo.ownerName,
            rosterSlot: rosterInfo.rosterSlot,
            isEliminated: eliminatedTeams.has(defense.abbreviation.toUpperCase()),
            stats: {},
            points: defense.totalPoints,
          });
        }
      }
    }
  }

  // Group players by team
  const awayPlayers = players.filter(
    (p) => p.team.toUpperCase() === awayCompetitor.team.abbreviation.toUpperCase()
  );
  const homePlayers = players.filter(
    (p) => p.team.toUpperCase() === homeCompetitor.team.abbreviation.toUpperCase()
  );

  const awayScore = parseInt(awayCompetitor.score) || 0;
  const homeScore = parseInt(homeCompetitor.score) || 0;
  const awayWinning = awayScore > homeScore;
  const homeWinning = homeScore > awayScore;

  const awayEliminated = eliminatedTeams.has(awayCompetitor.team.abbreviation.toUpperCase());
  const homeEliminated = eliminatedTeams.has(homeCompetitor.team.abbreviation.toUpperCase());

  const awayFantasyPts = awayPlayers.reduce((sum, p) => sum + p.points, 0);
  const homeFantasyPts = homePlayers.reduce((sum, p) => sum + p.points, 0);

  // Fetch player props for this week
  const playerPropsForWeek = await prisma.playerProp.findMany({
    where: {
      year: CURRENT_SEASON_YEAR,
      week: gameWeek,
    },
    select: {
      playerId: true,
      propType: true,
      line: true,
      impliedOver: true,
    },
  });

  // Group props by player
  const propsByPlayerId = new Map<string, PlayerProp[]>();
  for (const prop of playerPropsForWeek) {
    const existing = propsByPlayerId.get(prop.playerId) || [];
    existing.push({
      propType: prop.propType,
      line: prop.line,
      impliedOver: prop.impliedOver,
    });
    propsByPlayerId.set(prop.playerId, existing);
  }

  // For pre-game: Get all rostered players on these teams with their playoff totals
  interface PreGamePlayer {
    id: string;
    name: string;
    position: string;
    ownerName: string;
    rosterSlot: string;
    totalPoints: number;
    gamesPlayed: number;
    espnId: string | null;
    props: PlayerProp[];
  }

  const preGameAwayPlayers: PreGamePlayer[] = [];
  const preGameHomePlayers: PreGamePlayer[] = [];

  for (const roster of rosters) {
    const playerTeam = roster.player.team?.toUpperCase();
    if (!playerTeam) continue;

    const totalPoints = roster.player.scores.reduce((sum, s) => sum + s.points, 0);
    const gamesPlayed = roster.player.scores.length;
    const playerProps = propsByPlayerId.get(roster.player.id) || [];

    const playerInfo: PreGamePlayer = {
      id: roster.player.id,
      name: roster.player.name,
      position: roster.player.position,
      ownerName: roster.owner.name,
      rosterSlot: roster.rosterSlot,
      totalPoints,
      gamesPlayed,
      espnId: roster.player.espnId,
      props: playerProps,
    };

    if (playerTeam === awayCompetitor.team.abbreviation.toUpperCase()) {
      preGameAwayPlayers.push(playerInfo);
    } else if (playerTeam === homeCompetitor.team.abbreviation.toUpperCase()) {
      preGameHomePlayers.push(playerInfo);
    }
  }

  // Sort by total points descending
  preGameAwayPlayers.sort((a, b) => b.totalPoints - a.totalPoints);
  preGameHomePlayers.sort((a, b) => b.totalPoints - a.totalPoints);

  const weekLabels: Record<number, string> = {
    1: "Wild Card",
    2: "Divisional",
    3: "Conference Championship",
    5: "Super Bowl",
  };

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/schedule"
        className="inline-flex items-center gap-2 text-[var(--chalk-blue)] hover:text-[var(--chalk-pink)] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Schedule
      </Link>

      {/* Game Header */}
      <div className="chalk-box p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-[var(--chalk-muted)]">
            {weekLabels[gameWeek] || `Week ${gameWeek}`}
          </span>
          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-900/50 text-green-400 text-sm font-medium animate-pulse">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              LIVE
            </span>
          )}
          {isCompleted && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-gray-700/50 text-gray-400 text-sm font-medium">
              FINAL
            </span>
          )}
          {isScheduled && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-900/50 text-blue-400 text-sm font-medium">
              {gameEvent.status.type.detail}
            </span>
          )}
        </div>

        {/* Scoreboard */}
        <div className="flex items-center justify-center gap-4 sm:gap-8">
          {/* Away Team */}
          <div className="text-center flex-1 max-w-[200px]">
            <div className="flex justify-center mb-2">
              <TeamLogoServer abbreviation={awayCompetitor.team.abbreviation} size={64} />
            </div>
            <div
              className={`text-xl sm:text-3xl font-bold mb-1 ${
                awayEliminated
                  ? "text-red-400/50"
                  : awayWinning && !isScheduled
                    ? "text-[var(--chalk-green)]"
                    : "text-[var(--chalk-white)]"
              }`}
            >
              {awayCompetitor.team.abbreviation}
            </div>
            {awayEliminated && <div className="text-xs text-red-400 font-medium mb-1">OUT</div>}
            <div className="text-xs sm:text-sm text-[var(--chalk-muted)] truncate">
              {awayCompetitor.team.displayName}
            </div>
            {!isScheduled && (
              <div
                className={`text-3xl sm:text-5xl font-bold mt-2 chalk-score ${
                  awayWinning ? "text-[var(--chalk-green)]" : "text-[var(--chalk-white)]"
                }`}
              >
                {awayScore}
              </div>
            )}
          </div>

          {/* Center Info */}
          <div className="text-center px-2 sm:px-8 flex-shrink-0">
            {isLive && gameEvent.status.displayClock && (
              <div className="text-[var(--chalk-green)]">
                <div className="text-sm sm:text-lg font-medium">
                  {formatQuarter(gameEvent.status.period)}
                </div>
                <div className="text-lg sm:text-2xl font-bold">{gameEvent.status.displayClock}</div>
              </div>
            )}
            {!isLive && <div className="text-[var(--chalk-muted)] text-lg sm:text-xl">@</div>}
          </div>

          {/* Home Team */}
          <div className="text-center flex-1 max-w-[200px]">
            <div className="flex justify-center mb-2">
              <TeamLogoServer abbreviation={homeCompetitor.team.abbreviation} size={64} />
            </div>
            <div
              className={`text-xl sm:text-3xl font-bold mb-1 ${
                homeEliminated
                  ? "text-red-400/50"
                  : homeWinning && !isScheduled
                    ? "text-[var(--chalk-green)]"
                    : "text-[var(--chalk-white)]"
              }`}
            >
              {homeCompetitor.team.abbreviation}
            </div>
            {homeEliminated && <div className="text-xs text-red-400 font-medium mb-1">OUT</div>}
            <div className="text-xs sm:text-sm text-[var(--chalk-muted)] truncate">
              {homeCompetitor.team.displayName}
            </div>
            {!isScheduled && (
              <div
                className={`text-3xl sm:text-5xl font-bold mt-2 chalk-score ${
                  homeWinning ? "text-[var(--chalk-green)]" : "text-[var(--chalk-white)]"
                }`}
              >
                {homeScore}
              </div>
            )}
          </div>
        </div>

        {/* Game Info */}
        <div className="mt-4 pt-4 border-t border-dashed border-[var(--chalk-muted)]/30 text-center text-xs text-[var(--chalk-muted)]">
          {gameEvent.date && (
            <span>
              {new Date(gameEvent.date).toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              {" at "}
              {new Date(gameEvent.date).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Weather Section */}
      <WeatherSection weather={weatherData} />

      {/* Team Odds Section */}
      <TeamOddsSection
        awayTeam={awayCompetitor.team.abbreviation}
        homeTeam={homeCompetitor.team.abbreviation}
        awayOdds={awayTeamOdds}
        homeOdds={homeTeamOdds}
      />

      {/* Your Players Section */}
      {(awayPlayers.length > 0 || homePlayers.length > 0) && (
        <div className="chalk-box p-6">
          <h2 className="text-xl font-bold text-[var(--chalk-white)] mb-6">
            Rostered Players in This Game
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Away Team Players */}
            <div>
              <div
                className={`flex items-center justify-between p-3 rounded-lg mb-4 ${
                  awayEliminated ? "bg-red-900/20" : "bg-[rgba(255,255,255,0.05)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <TeamLogoServer abbreviation={awayCompetitor.team.abbreviation} size={32} />
                  <span
                    className={`text-lg font-bold ${
                      awayEliminated ? "text-red-400" : "text-[var(--chalk-white)]"
                    }`}
                  >
                    {awayCompetitor.team.abbreviation}
                    {awayEliminated && " - Eliminated"}
                  </span>
                </div>
                <span
                  className={`text-lg font-bold ${
                    awayEliminated ? "text-[var(--chalk-muted)]" : "text-[var(--chalk-green)]"
                  }`}
                >
                  {awayFantasyPts.toFixed(1)} pts
                </span>
              </div>
              {awayPlayers.length > 0 ? (
                <div className="space-y-3">
                  {awayPlayers.map((player) => (
                    <PlayerCard key={player.playerId} player={player} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-[var(--chalk-muted)]">
                  No rostered players
                </div>
              )}
            </div>

            {/* Home Team Players */}
            <div>
              <div
                className={`flex items-center justify-between p-3 rounded-lg mb-4 ${
                  homeEliminated ? "bg-red-900/20" : "bg-[rgba(255,255,255,0.05)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <TeamLogoServer abbreviation={homeCompetitor.team.abbreviation} size={32} />
                  <span
                    className={`text-lg font-bold ${
                      homeEliminated ? "text-red-400" : "text-[var(--chalk-white)]"
                    }`}
                  >
                    {homeCompetitor.team.abbreviation}
                    {homeEliminated && " - Eliminated"}
                  </span>
                </div>
                <span
                  className={`text-lg font-bold ${
                    homeEliminated ? "text-[var(--chalk-muted)]" : "text-[var(--chalk-green)]"
                  }`}
                >
                  {homeFantasyPts.toFixed(1)} pts
                </span>
              </div>
              {homePlayers.length > 0 ? (
                <div className="space-y-3">
                  {homePlayers.map((player) => (
                    <PlayerCard key={player.playerId} player={player} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-[var(--chalk-muted)]">
                  No rostered players
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No Players Message */}
      {awayPlayers.length === 0 && homePlayers.length === 0 && !isScheduled && (
        <div className="chalk-box p-6 text-center">
          <div className="text-[var(--chalk-muted)]">
            No rostered players from your league are in this game
          </div>
        </div>
      )}

      {/* Pre-Game: Rostered Players Preview */}
      {isScheduled && (preGameAwayPlayers.length > 0 || preGameHomePlayers.length > 0) && (
        <div className="chalk-box p-6">
          <h2 className="text-xl font-bold text-[var(--chalk-white)] mb-2">
            Rostered Players in This Game
          </h2>
          <p className="text-sm text-[var(--chalk-muted)] mb-6">
            Game starts{" "}
            {new Date(gameEvent.date).toLocaleString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Away Team */}
            <div>
              <div className="flex items-center gap-3 p-3 rounded-lg mb-4 bg-[rgba(255,255,255,0.05)]">
                <TeamLogoServer abbreviation={awayCompetitor.team.abbreviation} size={32} />
                <span className="text-lg font-bold text-[var(--chalk-white)]">
                  {awayCompetitor.team.abbreviation}
                </span>
                <span className="text-sm text-[var(--chalk-muted)]">
                  {preGameAwayPlayers.length} player{preGameAwayPlayers.length !== 1 ? "s" : ""}
                </span>
              </div>
              {preGameAwayPlayers.length > 0 ? (
                <div className="space-y-2">
                  {preGameAwayPlayers.map((player) => (
                    <Link
                      key={player.id}
                      href={`/player/${player.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(0,0,0,0.2)] hover:bg-[rgba(0,0,0,0.3)] transition-colors"
                    >
                      {player.espnId ? (
                        <Image
                          src={`https://a.espncdn.com/i/headshots/nfl/players/full/${player.espnId}.png`}
                          alt={player.name}
                          width={40}
                          height={40}
                          className="rounded-full bg-[rgba(255,255,255,0.1)]"
                          unoptimized
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.1)] flex items-center justify-center">
                          <span className="text-xs text-[var(--chalk-muted)]">
                            {player.position}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[var(--chalk-white)] truncate">
                          {player.name}
                        </div>
                        <div className="text-xs text-[var(--chalk-muted)]">
                          {player.position} - {player.ownerName}
                        </div>
                        <PlayerPropsPreview props={player.props} />
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[var(--chalk-green)]">
                          {player.totalPoints.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-[var(--chalk-muted)]">
                          {player.gamesPlayed > 0
                            ? `${player.gamesPlayed} game${player.gamesPlayed !== 1 ? "s" : ""}`
                            : "No games"}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-[var(--chalk-muted)]">
                  No rostered players
                </div>
              )}
            </div>

            {/* Home Team */}
            <div>
              <div className="flex items-center gap-3 p-3 rounded-lg mb-4 bg-[rgba(255,255,255,0.05)]">
                <TeamLogoServer abbreviation={homeCompetitor.team.abbreviation} size={32} />
                <span className="text-lg font-bold text-[var(--chalk-white)]">
                  {homeCompetitor.team.abbreviation}
                </span>
                <span className="text-sm text-[var(--chalk-muted)]">
                  {preGameHomePlayers.length} player{preGameHomePlayers.length !== 1 ? "s" : ""}
                </span>
              </div>
              {preGameHomePlayers.length > 0 ? (
                <div className="space-y-2">
                  {preGameHomePlayers.map((player) => (
                    <Link
                      key={player.id}
                      href={`/player/${player.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(0,0,0,0.2)] hover:bg-[rgba(0,0,0,0.3)] transition-colors"
                    >
                      {player.espnId ? (
                        <Image
                          src={`https://a.espncdn.com/i/headshots/nfl/players/full/${player.espnId}.png`}
                          alt={player.name}
                          width={40}
                          height={40}
                          className="rounded-full bg-[rgba(255,255,255,0.1)]"
                          unoptimized
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.1)] flex items-center justify-center">
                          <span className="text-xs text-[var(--chalk-muted)]">
                            {player.position}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[var(--chalk-white)] truncate">
                          {player.name}
                        </div>
                        <div className="text-xs text-[var(--chalk-muted)]">
                          {player.position} - {player.ownerName}
                        </div>
                        <PlayerPropsPreview props={player.props} />
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[var(--chalk-green)]">
                          {player.totalPoints.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-[var(--chalk-muted)]">
                          {player.gamesPlayed > 0
                            ? `${player.gamesPlayed} game${player.gamesPlayed !== 1 ? "s" : ""}`
                            : "No games"}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-[var(--chalk-muted)]">
                  No rostered players
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pre-Game: No Rostered Players */}
      {isScheduled && preGameAwayPlayers.length === 0 && preGameHomePlayers.length === 0 && (
        <div className="chalk-box p-6 text-center">
          <div className="text-[var(--chalk-muted)]">
            No rostered players from the league are in this game. Check back when the game begins
            for live stats.
          </div>
        </div>
      )}

      {/* Scoring Link */}
      <div className="text-center">
        <Link
          href="/scoring"
          className="text-[var(--chalk-blue)] hover:text-[var(--chalk-pink)] text-sm transition-colors"
        >
          View all scoring rules
        </Link>
      </div>
    </div>
  );
}
