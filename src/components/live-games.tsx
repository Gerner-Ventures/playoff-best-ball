"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { PlayoffGame, GamePlayer } from "@/types";
import { WeatherIndicator, PropSummary } from "./prop-progress-bar";

// Enhanced types from games API
interface EnhancedPlayoffGame extends PlayoffGame {
  weather?: {
    temperature: number;
    windSpeed: number;
    windDirection: string;
    condition: string;
    isDome: boolean;
    icon: string;
    impact: { level: string; description: string };
  };
  homeWinProb?: number;
  awayWinProb?: number;
}

interface EnhancedGamePlayer extends GamePlayer {
  props?: { propType: string; line: number }[];
}

interface LiveGamesData {
  games: EnhancedPlayoffGame[];
  eliminatedTeams: string[];
  week: number;
  year: number;
  lastUpdated: string;
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

const WEEK_LABELS: Record<number, string> = {
  1: "Wild Card",
  2: "Divisional",
  3: "Conference",
  5: "Super Bowl",
};

function formatQuarter(period?: number): string {
  if (!period) return "";
  if (period <= 4) return `Q${period}`;
  return `OT${period - 4 > 1 ? period - 4 : ""}`;
}

function GameStatusBadge({ status }: { status: PlayoffGame["status"] }) {
  if (status.state === "in") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 text-xs font-medium animate-pulse">
        <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
        LIVE
      </span>
    );
  }
  if (status.completed) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-700/50 text-gray-400 text-xs font-medium">
        FINAL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-400 text-xs font-medium">
      {status.detail}
    </span>
  );
}

// Build fantasy-relevant stat chips
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
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
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

function PlayerStatLine({
  player,
  gameProgress,
}: {
  player: EnhancedGamePlayer;
  gameProgress?: number;
}) {
  const posColor = POSITION_COLORS[player.position] || "text-[var(--chalk-white)]";
  const isInjured = player.isInjured;
  const isSubstitute = player.isSubstitute;

  // Build fantasy stat chips with point values
  const statChips: React.ReactNode[] = [];

  // Passing stats
  if (player.stats.passYards) {
    const pts = player.stats.passYards / 30; // 30 yards per point
    statChips.push(
      <StatChip
        key="passYds"
        label="pass yds"
        value={String(player.stats.passYards)}
        points={pts}
      />
    );
  }
  if (player.stats.passTd) {
    const pts = player.stats.passTd * 6;
    statChips.push(
      <StatChip key="passTd" label="TD" value={String(player.stats.passTd)} points={pts} />
    );
  }
  if (player.stats.passInt) {
    const pts = player.stats.passInt * -2;
    statChips.push(
      <StatChip
        key="passInt"
        label="INT"
        value={String(player.stats.passInt)}
        points={pts}
        isNegative
      />
    );
  }

  // Rushing stats
  if (player.stats.rushYards) {
    const pts = player.stats.rushYards / 10; // 10 yards per point
    statChips.push(
      <StatChip
        key="rushYds"
        label="rush yds"
        value={String(player.stats.rushYards)}
        points={pts}
      />
    );
  }
  if (player.stats.rushTd) {
    const pts = player.stats.rushTd * 6;
    statChips.push(
      <StatChip key="rushTd" label="TD" value={String(player.stats.rushTd)} points={pts} />
    );
  }

  // Receiving stats
  if (player.stats.receptions) {
    const pts = player.stats.receptions * 0.5; // Half PPR
    statChips.push(
      <StatChip key="rec" label="rec" value={String(player.stats.receptions)} points={pts} />
    );
  }
  if (player.stats.recYards) {
    const pts = player.stats.recYards / 10; // 10 yards per point
    statChips.push(
      <StatChip key="recYds" label="rec yds" value={String(player.stats.recYards)} points={pts} />
    );
  }
  if (player.stats.recTd) {
    const pts = player.stats.recTd * 6;
    statChips.push(
      <StatChip key="recTd" label="TD" value={String(player.stats.recTd)} points={pts} />
    );
  }

  // Fumbles
  if (player.stats.fumblesLost) {
    const pts = player.stats.fumblesLost * -2;
    statChips.push(
      <StatChip
        key="fumble"
        label="fumble"
        value={String(player.stats.fumblesLost)}
        points={pts}
        isNegative
      />
    );
  }

  return (
    <Link
      href={`/player/${player.playerId}`}
      className={`block p-3 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors border ${
        player.isEliminated
          ? "border-red-900/30 bg-red-900/10"
          : isInjured
            ? "border-orange-900/30 bg-orange-900/10"
            : isSubstitute
              ? "border-blue-900/30 bg-blue-900/10"
              : "border-transparent bg-[rgba(0,0,0,0.2)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span
            className={`text-xs font-mono w-8 pt-0.5 ${
              player.isEliminated || isInjured ? "opacity-50" : ""
            } ${player.isEliminated ? "text-red-400/50" : posColor}`}
          >
            {player.position}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-sm font-medium truncate ${
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
                <span className="text-[8px] text-red-400 bg-red-900/30 px-1 py-0.5 rounded">
                  OUT
                </span>
              )}
              <span className="text-xs text-[var(--chalk-muted)]">({player.ownerName})</span>
            </div>

            {/* Substitute player info for injured player */}
            {isInjured && player.substitution && (
              <div className="mt-1 text-xs text-orange-300 flex items-center gap-1">
                <span className="text-[var(--chalk-muted)]">Replaced by:</span>
                <span
                  className="text-[var(--chalk-blue)] hover:underline cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = `/player/${player.substitution!.substitutePlayer.id}`;
                  }}
                >
                  {player.substitution.substitutePlayer.name}
                </span>
              </div>
            )}

            {/* Original player info for substitute */}
            {isSubstitute && player.originalPlayer && (
              <div className="mt-1 text-xs text-blue-300 flex items-center gap-1">
                <span className="text-[var(--chalk-muted)]">Filling in for:</span>
                <span
                  className="text-[var(--chalk-blue)] hover:underline cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = `/player/${player.originalPlayer!.id}`;
                  }}
                >
                  {player.originalPlayer.name}
                </span>
              </div>
            )}

            {/* Eliminated banner */}
            {player.isEliminated && !isInjured && !isSubstitute && (
              <div className="mt-1 text-xs text-red-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Eliminated - No more points possible</span>
              </div>
            )}

            {/* Stats chips */}
            {statChips.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{statChips}</div>}
            {statChips.length === 0 && !player.isEliminated && !isInjured && (
              <div className="mt-1 text-xs text-[var(--chalk-muted)]">No stats yet</div>
            )}

            {/* Prop lines progress */}
            {player.props && player.props.length > 0 && !player.isEliminated && !isInjured && (
              <PropSummary
                props={player.props}
                currentStats={player.stats}
                gameProgress={gameProgress}
              />
            )}
          </div>
        </div>

        {/* Total points */}
        <div className="text-right flex-shrink-0">
          <div
            className={`text-lg font-bold ${
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

function GameCard({
  game,
  eliminatedTeams,
}: {
  game: EnhancedPlayoffGame;
  eliminatedTeams: string[];
}) {
  const awayWinning = game.awayTeam.score > game.homeTeam.score;
  const homeWinning = game.homeTeam.score > game.awayTeam.score;
  const isLive = game.status.state === "in";

  // Check if teams are eliminated
  const awayEliminated = eliminatedTeams.includes(game.awayTeam.abbreviation.toUpperCase());
  const homeEliminated = eliminatedTeams.includes(game.homeTeam.abbreviation.toUpperCase());

  // Group players by team (cast to enhanced type)
  const awayPlayers = game.players.filter(
    (p) => p.team.toUpperCase() === game.awayTeam.abbreviation.toUpperCase()
  ) as EnhancedGamePlayer[];
  const homePlayers = game.players.filter(
    (p) => p.team.toUpperCase() === game.homeTeam.abbreviation.toUpperCase()
  ) as EnhancedGamePlayer[];

  // Calculate team fantasy points
  const awayFantasyPts = awayPlayers.reduce((sum, p) => sum + p.points, 0);
  const homeFantasyPts = homePlayers.reduce((sum, p) => sum + p.points, 0);

  // Calculate game progress for prop tracking (0-1)
  const gameProgress =
    isLive && game.status.period
      ? Math.min(game.status.period / 4, 1)
      : game.status.completed
        ? 1
        : 0;

  return (
    <div className="chalk-box overflow-hidden">
      {/* Game Header */}
      <div className="p-3 sm:p-4 border-b border-[rgba(255,255,255,0.1)]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--chalk-muted)]">
              {WEEK_LABELS[game.week] || `Week ${game.week}`}
            </span>
            {/* Weather indicator */}
            {game.weather && (
              <WeatherIndicator
                temperature={game.weather.temperature}
                windSpeed={game.weather.windSpeed}
                condition={game.weather.condition}
                isDome={game.weather.isDome}
                compact
              />
            )}
          </div>
          <GameStatusBadge status={game.status} />
        </div>

        {/* Scoreboard */}
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {/* Away Team */}
          <div className="flex items-center gap-1 sm:gap-3 min-w-0">
            <div className="text-center min-w-0">
              <div
                className={`text-base sm:text-lg font-bold truncate ${
                  awayEliminated
                    ? "text-red-400/50"
                    : awayWinning
                      ? "text-[var(--chalk-white)]"
                      : "text-[var(--chalk-muted)]"
                }`}
              >
                {game.awayTeam.abbreviation}
              </div>
              {awayEliminated && <div className="text-xs text-red-400 font-medium">OUT</div>}
              <div className="text-xs text-[var(--chalk-muted)] hidden sm:block">
                {game.awayTeam.displayName}
              </div>
            </div>
            <div
              className={`text-2xl sm:text-3xl font-bold chalk-score ${
                awayEliminated
                  ? "text-[var(--chalk-muted)]"
                  : awayWinning
                    ? "text-[var(--chalk-green)]"
                    : "text-[var(--chalk-white)]"
              }`}
            >
              {game.awayTeam.score}
            </div>
          </div>

          {/* Game Info */}
          <div className="text-center px-1 sm:px-4 flex-shrink-0">
            {isLive ? (
              <div className="text-[var(--chalk-green)]">
                <div className="text-xs sm:text-sm font-medium">
                  {formatQuarter(game.status.period)}
                </div>
                <div className="text-sm sm:text-lg font-bold">{game.status.displayClock}</div>
              </div>
            ) : game.status.completed ? (
              <div className="text-[var(--chalk-muted)] text-xs sm:text-sm">Final</div>
            ) : (
              <div className="text-[var(--chalk-muted)] text-xs">{game.status.detail}</div>
            )}
          </div>

          {/* Home Team */}
          <div className="flex items-center gap-1 sm:gap-3 min-w-0">
            <div
              className={`text-2xl sm:text-3xl font-bold chalk-score ${
                homeEliminated
                  ? "text-[var(--chalk-muted)]"
                  : homeWinning
                    ? "text-[var(--chalk-green)]"
                    : "text-[var(--chalk-white)]"
              }`}
            >
              {game.homeTeam.score}
            </div>
            <div className="text-center min-w-0">
              <div
                className={`text-base sm:text-lg font-bold truncate ${
                  homeEliminated
                    ? "text-red-400/50"
                    : homeWinning
                      ? "text-[var(--chalk-white)]"
                      : "text-[var(--chalk-muted)]"
                }`}
              >
                {game.homeTeam.abbreviation}
              </div>
              {homeEliminated && <div className="text-xs text-red-400 font-medium">OUT</div>}
              <div className="text-xs text-[var(--chalk-muted)] hidden sm:block">
                {game.homeTeam.displayName}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Players Section - only show if there are rostered players from either team */}
      {(awayPlayers.length > 0 || homePlayers.length > 0) && (
        <div className="p-2 sm:p-3">
          <div className="text-xs font-medium text-[var(--chalk-muted)] mb-3 uppercase tracking-wider">
            Rostered Players - Fantasy Scoring
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Away Team Players */}
            {awayPlayers.length > 0 && (
              <div className="space-y-2">
                <div
                  className={`flex items-center justify-between px-2 py-1 rounded ${
                    awayEliminated ? "bg-red-900/20" : "bg-[rgba(255,255,255,0.05)]"
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      awayEliminated ? "text-red-400" : "text-[var(--chalk-white)]"
                    }`}
                  >
                    {game.awayTeam.abbreviation}
                    {awayEliminated && " - Eliminated"}
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      awayEliminated ? "text-[var(--chalk-muted)]" : "text-[var(--chalk-green)]"
                    }`}
                  >
                    {awayFantasyPts.toFixed(1)} pts
                  </span>
                </div>
                {awayPlayers.map((player) => (
                  <PlayerStatLine
                    key={player.playerId}
                    player={player}
                    gameProgress={gameProgress}
                  />
                ))}
              </div>
            )}
            {/* Home Team Players */}
            {homePlayers.length > 0 && (
              <div className="space-y-2">
                <div
                  className={`flex items-center justify-between px-2 py-1 rounded ${
                    homeEliminated ? "bg-red-900/20" : "bg-[rgba(255,255,255,0.05)]"
                  }`}
                >
                  <span
                    className={`text-sm font-medium ${
                      homeEliminated ? "text-red-400" : "text-[var(--chalk-white)]"
                    }`}
                  >
                    {game.homeTeam.abbreviation}
                    {homeEliminated && " - Eliminated"}
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      homeEliminated ? "text-[var(--chalk-muted)]" : "text-[var(--chalk-green)]"
                    }`}
                  >
                    {homeFantasyPts.toFixed(1)} pts
                  </span>
                </div>
                {homePlayers.map((player) => (
                  <PlayerStatLine
                    key={player.playerId}
                    player={player}
                    gameProgress={gameProgress}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* No players message */}
      {awayPlayers.length === 0 && homePlayers.length === 0 && game.status.state !== "pre" && (
        <div className="p-3 text-center text-sm text-[var(--chalk-muted)]">
          No rostered players in this game
        </div>
      )}
      {game.status.state === "pre" && (
        <div className="p-3 text-center text-sm text-[var(--chalk-muted)]">
          Game has not started yet
        </div>
      )}
    </div>
  );
}

export function LiveGames() {
  const [data, setData] = useState<LiveGamesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  const fetchGames = useCallback(async (week: number) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/games?year=${CURRENT_SEASON_YEAR}&week=${week}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch games");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames(selectedWeek);
  }, [selectedWeek, fetchGames]);

  // Auto-refresh every 30 seconds for live games
  useEffect(() => {
    const hasLiveGames = data?.games.some((g) => g.status.state === "in");
    if (!hasLiveGames) return;

    const interval = setInterval(() => {
      fetchGames(selectedWeek);
    }, 30000);

    return () => clearInterval(interval);
  }, [data, selectedWeek, fetchGames]);

  const weeks = [1, 2, 3, 5];

  return (
    <div className="space-y-4">
      {/* Week Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {weeks.map((week) => (
          <button
            key={week}
            onClick={() => setSelectedWeek(week)}
            className={`px-3 sm:px-4 py-2 rounded text-sm font-medium transition-colors min-h-[44px] ${
              selectedWeek === week
                ? "bg-[var(--chalk-blue)] text-white"
                : "bg-[rgba(255,255,255,0.1)] text-[var(--chalk-muted)] hover:bg-[rgba(255,255,255,0.15)]"
            }`}
          >
            <span className="hidden sm:inline">{WEEK_LABELS[week] || `Week ${week}`}</span>
            <span className="sm:hidden">
              {week === 5 ? "SB" : week === 1 ? "WC" : week === 2 ? "DIV" : "CONF"}
            </span>
          </button>
        ))}
        <button
          onClick={() => fetchGames(selectedWeek)}
          disabled={loading}
          className="ml-auto chalk-button chalk-button-blue text-sm px-4 py-2 min-h-[44px]"
        >
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {/* Eliminated Teams Banner */}
      {data?.eliminatedTeams && data.eliminatedTeams.length > 0 && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
          <div className="text-xs text-red-400 font-medium mb-1">Eliminated Teams</div>
          <div className="text-sm text-[var(--chalk-muted)]">{data.eliminatedTeams.join(", ")}</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/30 p-4 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="text-center py-8 text-[var(--chalk-muted)]">Loading games...</div>
      )}

      {/* No Games */}
      {!loading && data?.games.length === 0 && (
        <div className="text-center py-8 text-[var(--chalk-muted)]">
          No games scheduled for this week
        </div>
      )}

      {/* Games Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {data?.games.map((game) => (
          <GameCard key={game.eventId} game={game} eliminatedTeams={data.eliminatedTeams || []} />
        ))}
      </div>

      {/* Last Updated */}
      {data?.lastUpdated && (
        <div className="text-xs text-[var(--chalk-muted)] text-center">
          Last updated: {new Date(data.lastUpdated).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
