"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { TeamLogo } from "./team-logo";

interface GameInfo {
  eventId: string;
  week: number;
  name: string;
  shortName: string;
  date: string;
  status: {
    state: "pre" | "in" | "post";
    completed: boolean;
    description: string;
    detail: string;
    displayClock?: string;
    period?: number;
  };
  homeTeam: {
    abbreviation: string;
    displayName: string;
    score: number;
  };
  awayTeam: {
    abbreviation: string;
    displayName: string;
    score: number;
  };
  hasRosteredPlayers?: boolean;
  // Enhanced data from odds and weather APIs
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

interface GamesTodayProps {
  rosteredTeams?: Set<string>;
  onRefresh?: () => void;
  onLiveGamesChange?: (hasLive: boolean) => void;
}

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

function formatGameTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// Weather impact color based on level
function getWeatherImpactColor(level: string): string {
  switch (level) {
    case "high":
      return "text-red-400";
    case "medium":
      return "text-yellow-400";
    case "low":
      return "text-blue-300";
    default:
      return "text-[var(--chalk-muted)]";
  }
}

function GameCard({ game, rosteredTeams }: { game: GameInfo; rosteredTeams?: Set<string> }) {
  const isLive = game.status.state === "in";
  const isFinal = game.status.completed;
  const isScheduled = game.status.state === "pre";

  const awayWinning = game.awayTeam.score > game.homeTeam.score;
  const homeWinning = game.homeTeam.score > game.awayTeam.score;

  const hasAway = rosteredTeams?.has(game.awayTeam.abbreviation.toUpperCase());
  const hasHome = rosteredTeams?.has(game.homeTeam.abbreviation.toUpperCase());
  const hasPlayers = hasAway || hasHome;

  // Calculate win probability bar widths (convert from 0-1 range to 0-100 percentage)
  const awayProb = (game.awayWinProb ?? 0.5) * 100;
  const homeProb = (game.homeWinProb ?? 0.5) * 100;

  return (
    <Link
      href={`/game/${game.eventId}`}
      className={`flex-shrink-0 w-[200px] p-3 rounded-lg transition-all hover:scale-[1.02] ${
        isLive
          ? "bg-green-900/20 border border-green-500/40 hover:border-green-500/60"
          : hasPlayers
            ? "bg-[var(--chalk-blue)]/10 border border-[var(--chalk-blue)]/30 hover:border-[var(--chalk-blue)]/50"
            : "bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.2)]"
      }`}
    >
      {/* Header: Week + Status + Weather */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--chalk-muted)] uppercase tracking-wide">
            {WEEK_LABELS[game.week] || `Week ${game.week}`}
          </span>
          {/* Weather indicator */}
          {game.weather && (
            <span
              className={`text-xs ${getWeatherImpactColor(game.weather.impact.level)}`}
              title={`${game.weather.temperature}°F, ${game.weather.windSpeed}mph ${game.weather.windDirection} - ${game.weather.impact.description}`}
            >
              {game.weather.icon}
            </span>
          )}
        </div>
        {isLive && (
          <span className="flex items-center gap-1 text-[10px] text-green-400 font-medium">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
            {formatQuarter(game.status.period)} {game.status.displayClock}
          </span>
        )}
        {isFinal && (
          <span className="text-[10px] text-[var(--chalk-muted)] font-medium">FINAL</span>
        )}
        {isScheduled && (
          <span className="text-[10px] text-[var(--chalk-blue)]">{formatGameTime(game.date)}</span>
        )}
      </div>

      {/* Away Team */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <TeamLogo abbreviation={game.awayTeam.abbreviation} size="sm" />
          <span
            className={`text-sm font-bold ${
              isFinal && awayWinning ? "text-[var(--chalk-green)]" : "text-[var(--chalk-white)]"
            }`}
          >
            {game.awayTeam.abbreviation}
          </span>
          {hasAway && (
            <span
              className="w-1.5 h-1.5 bg-[var(--chalk-blue)] rounded-full"
              title="Rostered players on this team"
            ></span>
          )}
        </div>
        <span
          className={`text-sm font-bold ${
            !isScheduled
              ? awayWinning
                ? "text-[var(--chalk-green)]"
                : "text-[var(--chalk-white)]"
              : "text-[var(--chalk-muted)]"
          }`}
        >
          {!isScheduled ? game.awayTeam.score : "-"}
        </span>
      </div>

      {/* Home Team */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <TeamLogo abbreviation={game.homeTeam.abbreviation} size="sm" />
          <span
            className={`text-sm font-bold ${
              isFinal && homeWinning ? "text-[var(--chalk-green)]" : "text-[var(--chalk-white)]"
            }`}
          >
            {game.homeTeam.abbreviation}
          </span>
          {hasHome && (
            <span
              className="w-1.5 h-1.5 bg-[var(--chalk-blue)] rounded-full"
              title="Rostered players on this team"
            ></span>
          )}
        </div>
        <span
          className={`text-sm font-bold ${
            !isScheduled
              ? homeWinning
                ? "text-[var(--chalk-green)]"
                : "text-[var(--chalk-white)]"
              : "text-[var(--chalk-muted)]"
          }`}
        >
          {!isScheduled ? game.homeTeam.score : "-"}
        </span>
      </div>

      {/* Win Probability Bar - Show for scheduled or live games */}
      {(isScheduled || isLive) && (game.awayWinProb || game.homeWinProb) && (
        <div className="mt-2 pt-2 border-t border-dashed border-[rgba(255,255,255,0.1)]">
          <div className="flex items-center gap-1 text-[9px] text-[var(--chalk-muted)] mb-1">
            <span>{Math.round(awayProb)}%</span>
            <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--chalk-blue)] to-[var(--chalk-green)]"
                style={{ width: `${awayProb}%` }}
              />
            </div>
            <span>{Math.round(homeProb)}%</span>
          </div>
          <div className="text-[8px] text-center text-[var(--chalk-muted)]">Win Probability</div>
        </div>
      )}
    </Link>
  );
}

export function GamesToday({ rosteredTeams, onRefresh, onLiveGamesChange }: GamesTodayProps) {
  const [games, setGames] = useState<GameInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMyGamesOnly, setShowMyGamesOnly] = useState(false);

  const fetchGames = useCallback(async () => {
    try {
      setLoading(true);
      const weeks = [1, 2, 3, 5];
      const allGames: GameInfo[] = [];

      for (const week of weeks) {
        const response = await fetch(`/api/games?year=${CURRENT_SEASON_YEAR}&week=${week}`);
        if (!response.ok) continue;
        const result = await response.json();

        const gamesWithWeek = result.games.map((g: GameInfo) => ({
          ...g,
          week,
        }));
        allGames.push(...gamesWithWeek);
      }

      // Sort games: Live first, then upcoming (by date), then completed
      allGames.sort((a, b) => {
        // Live games first
        if (a.status.state === "in" && b.status.state !== "in") return -1;
        if (a.status.state !== "in" && b.status.state === "in") return 1;

        // Then upcoming games by date
        if (a.status.state === "pre" && b.status.state === "pre") {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        }
        if (a.status.state === "pre" && b.status.state !== "pre") return -1;
        if (a.status.state !== "pre" && b.status.state === "pre") return 1;

        // Completed games last, newest first
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setGames(allGames);
    } catch (err) {
      console.error("Failed to fetch games:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Report live games status to parent
  useEffect(() => {
    const hasLive = games.some((g) => g.status.state === "in");
    onLiveGamesChange?.(hasLive);
  }, [games, onLiveGamesChange]);

  // Auto-refresh game status every 60 seconds if there are live games
  // Note: This only refreshes game cards, the parent handles ESPN sync
  useEffect(() => {
    const hasLiveGames = games.some((g) => g.status.state === "in");
    if (!hasLiveGames) return;

    const interval = setInterval(() => {
      fetchGames();
    }, 60000);

    return () => clearInterval(interval);
  }, [games, fetchGames]);

  // Filter games if showing only my games
  const filteredGames =
    showMyGamesOnly && rosteredTeams
      ? games.filter(
          (g) =>
            rosteredTeams.has(g.awayTeam.abbreviation.toUpperCase()) ||
            rosteredTeams.has(g.homeTeam.abbreviation.toUpperCase())
        )
      : games;

  // Get counts for display
  const liveCount = games.filter((g) => g.status.state === "in").length;
  const upcomingCount = games.filter((g) => g.status.state === "pre").length;

  if (loading && games.length === 0) {
    return (
      <div className="chalk-box p-4">
        <div className="text-center text-[var(--chalk-muted)] text-sm">Loading games...</div>
      </div>
    );
  }

  if (games.length === 0) {
    return null;
  }

  return (
    <div className="chalk-box p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-[var(--chalk-white)]">Playoff Games</h2>
          {liveCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
              {liveCount} Live
            </span>
          )}
          {upcomingCount > 0 && (
            <span className="text-xs text-[var(--chalk-muted)]">{upcomingCount} Upcoming</span>
          )}
        </div>
        {rosteredTeams && rosteredTeams.size > 0 && (
          <button
            onClick={() => setShowMyGamesOnly(!showMyGamesOnly)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              showMyGamesOnly
                ? "bg-[var(--chalk-blue)] text-white"
                : "bg-[rgba(255,255,255,0.1)] text-[var(--chalk-muted)] hover:text-[var(--chalk-white)]"
            }`}
          >
            Rostered Only
          </button>
        )}
      </div>

      {/* Scrollable Game Cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-[rgba(255,255,255,0.2)] scrollbar-track-transparent">
        {filteredGames.map((game) => (
          <GameCard key={game.eventId} game={game} rosteredTeams={rosteredTeams} />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-dashed border-[var(--chalk-muted)]/30 text-[10px] text-[var(--chalk-muted)]">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-[var(--chalk-blue)] rounded-full"></span>
          Rostered
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
          Live
        </span>
        <span className="flex items-center gap-1" title="Weather impact: none, low, medium, high">
          <span className="text-yellow-400">*</span>
          Weather
        </span>
        <Link href="/schedule" className="ml-auto text-[var(--chalk-blue)] hover:underline">
          Full schedule
        </Link>
      </div>
    </div>
  );
}
