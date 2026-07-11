"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { GamesToday } from "./games-today";

// Determine current playoff week based on date
function getCurrentPlayoffWeek(): number {
  const now = new Date();
  // 2025-26 NFL Playoff dates (approximate)
  const wildCardEnd = new Date("2026-01-14");
  const divisionalEnd = new Date("2026-01-20");
  const conferenceEnd = new Date("2026-01-27");

  if (now < wildCardEnd) return 1;
  if (now < divisionalEnd) return 2;
  if (now < conferenceEnd) return 3;
  return 5; // Super Bowl
}

interface SubstitutionData {
  effectiveWeek: number;
  reason?: string | null;
  substitutePlayer: {
    id: string;
    name: string;
    team?: string | null;
  };
}

interface PlayerScore {
  id: string;
  name: string;
  position: string;
  team: string | null;
  slot: string;
  points: number;
  isEliminated: boolean;
  previousPoints?: number;
  projectedPoints?: number;
  expectedValue?: number | null;
  hasSubstitution?: boolean;
  substitution?: SubstitutionData | null;
}

interface OwnerRoster {
  ownerId: string;
  ownerName: string;
  players: PlayerScore[];
  totalPoints: number;
  activePlayers: number;
  previousTotal?: number;
  projectedPoints?: number;
  expectedValue?: number;
}

interface LiveData {
  rosters: OwnerRoster[];
  eliminatedTeams: string[];
  lastUpdated: string;
  week: number;
}

interface ProjectionData {
  projections: {
    ownerId: string;
    players: {
      id: string;
      projectedPoints: number;
      expectedValue: number | null;
    }[];
    projectedPoints: number;
    expectedValue: number;
  }[];
}

interface WeatherAlert {
  gameId: string;
  teams: string;
  impact: string;
  description: string;
}

const POSITION_COLORS: Record<string, string> = {
  QB: "text-red-400",
  RB: "text-green-400",
  WR: "text-blue-400",
  TE: "text-yellow-400",
  K: "text-purple-400",
  DST: "text-orange-400",
};

export function LiveScoreboard() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [showProjections, setShowProjections] = useState(false);
  const [hasLiveGames, setHasLiveGames] = useState(false);
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlert[]>([]);
  const isInitialMount = useRef(true);

  const fetchScores = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch live scores, projections, and current week games for weather
      const currentWeek = getCurrentPlayoffWeek();
      const [liveResponse, projectionsResponse, gamesResponse] = await Promise.all([
        fetch(`/api/live?year=${CURRENT_SEASON_YEAR}`),
        fetch(`/api/projections?year=${CURRENT_SEASON_YEAR}`),
        fetch(`/api/games?year=${CURRENT_SEASON_YEAR}&week=${currentWeek}`),
      ]);

      // Process weather alerts from games
      if (gamesResponse.ok) {
        const gamesData = await gamesResponse.json();
        const alerts: WeatherAlert[] = [];
        for (const game of gamesData.games || []) {
          if (game.weather && game.weather.impact?.level && game.weather.impact.level !== "none") {
            if (game.weather.impact.level === "high" || game.weather.impact.level === "medium") {
              alerts.push({
                gameId: game.eventId,
                teams: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
                impact: game.weather.impact.level,
                description: game.weather.impact.description,
              });
            }
          }
        }
        setWeatherAlerts(alerts);
      }

      if (!liveResponse.ok) {
        throw new Error(`Failed to fetch: ${liveResponse.status}`);
      }

      const result = await liveResponse.json();
      let projections: ProjectionData | null = null;

      if (projectionsResponse.ok) {
        projections = await projectionsResponse.json();
      }

      // Check for score changes and add previousPoints + projections
      if (data?.rosters) {
        result.rosters = result.rosters.map((roster: OwnerRoster) => {
          const prevRoster = data.rosters.find((r) => r.ownerId === roster.ownerId);
          const projRoster = projections?.projections.find((p) => p.ownerId === roster.ownerId);

          return {
            ...roster,
            previousTotal: prevRoster?.totalPoints,
            projectedPoints: projRoster?.projectedPoints || 0,
            expectedValue: projRoster?.expectedValue || 0,
            players: roster.players.map((player) => {
              const prevPlayer = prevRoster?.players.find((p) => p.id === player.id);
              const projPlayer = projRoster?.players.find((p) => p.id === player.id);
              return {
                ...player,
                previousPoints: prevPlayer?.points,
                projectedPoints: projPlayer?.projectedPoints || 0,
                expectedValue: projPlayer?.expectedValue,
              };
            }),
          };
        });
      } else if (projections) {
        // First load - add projections
        result.rosters = result.rosters.map((roster: OwnerRoster) => {
          const projRoster = projections?.projections.find((p) => p.ownerId === roster.ownerId);
          return {
            ...roster,
            projectedPoints: projRoster?.projectedPoints || 0,
            expectedValue: projRoster?.expectedValue || 0,
            players: roster.players.map((player) => {
              const projPlayer = projRoster?.players.find((p) => p.id === player.id);
              return {
                ...player,
                projectedPoints: projPlayer?.projectedPoints || 0,
                expectedValue: projPlayer?.expectedValue,
              };
            }),
          };
        });
      }

      setData(result);
      setLastFetch(new Date());
      setCountdown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch scores");
    } finally {
      setLoading(false);
    }
  }, [data?.rosters]);

  const handleSync = useCallback(
    async (silent = false) => {
      if (!silent) setSyncing(true);
      try {
        const response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year: CURRENT_SEASON_YEAR,
            weeks: [1, 2, 3, 5],
          }),
        });
        if (response.ok) {
          setLastSync(new Date());
        }
        // Refresh scores after sync
        await fetchScores();
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : "Sync failed");
        }
      } finally {
        if (!silent) setSyncing(false);
      }
    },
    [fetchScores]
  );

  // Callback for GamesToday to report live game status
  const handleLiveGamesChange = useCallback((hasLive: boolean) => {
    setHasLiveGames(hasLive);
  }, []);

  // Initial fetch and sync
  useEffect(() => {
    // On initial mount, do a full sync to get fresh data
    if (isInitialMount.current) {
      isInitialMount.current = false;
      handleSync(true); // Silent sync on mount
    } else {
      fetchScores();
    }
  }, []);

  // Auto-refresh: sync with ESPN during live games, otherwise just fetch cached data
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (hasLiveGames) {
            // During live games, sync with ESPN for fresh data
            handleSync(true);
          } else {
            // No live games, just read cached data
            fetchScores();
          }
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchScores, handleSync, hasLiveGames]);

  // Sort rosters by total points
  const sortedRosters = data?.rosters?.slice().sort((a, b) => b.totalPoints - a.totalPoints) || [];

  // Get all rostered teams for the GamesToday component
  const rosteredTeams = useMemo(() => {
    const teams = new Set<string>();
    data?.rosters?.forEach((roster) => {
      roster.players.forEach((player) => {
        if (player.team) {
          teams.add(player.team.toUpperCase());
        }
      });
    });
    return teams;
  }, [data?.rosters]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with sync status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-[var(--chalk-yellow)] chalk-text">
            Live
          </h1>
          {hasLiveGames && (
            <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
              Games in progress
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Sync status indicator */}
          <div className="flex flex-col items-end text-xs">
            {hasLiveGames ? (
              <span className="text-green-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                    clipRule="evenodd"
                  />
                </svg>
                Auto-syncing in {countdown}s
              </span>
            ) : (
              <span className="text-[var(--chalk-muted)]">Cache refresh in {countdown}s</span>
            )}
            {lastSync && (
              <span className="text-[var(--chalk-muted)]">
                ESPN synced {lastSync.toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Manual sync button */}
          <button
            onClick={() => handleSync(false)}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--chalk-blue)] hover:bg-[var(--chalk-blue)]/80 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {syncing ? "Syncing..." : "Sync ESPN"}
          </button>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-2 rounded-lg transition-colors ${
              autoRefresh
                ? "bg-green-900/30 text-green-400"
                : "bg-[rgba(255,255,255,0.1)] text-[var(--chalk-muted)]"
            }`}
            title={autoRefresh ? "Auto-sync enabled" : "Auto-sync disabled"}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {autoRefresh ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Info banner explaining sync behavior */}
      {hasLiveGames && (
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg px-4 py-2 text-xs text-green-300 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <span>Live games detected - scores auto-sync with ESPN every 60 seconds</span>
        </div>
      )}

      {/* Weather alerts banner */}
      {weatherAlerts.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg px-4 py-2 text-xs">
          <div className="flex items-center gap-2 text-yellow-300 mb-1">
            <span>*</span>
            <span className="font-medium">Weather Alert</span>
          </div>
          <div className="space-y-1">
            {weatherAlerts.map((alert) => (
              <div key={alert.gameId} className="text-yellow-200/80 flex items-center gap-2">
                <span className="font-medium">{alert.teams}:</span>
                <span className={alert.impact === "high" ? "text-red-400" : "text-yellow-400"}>
                  {alert.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/30 p-3 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Games Today - Current/Upcoming Games */}
      <GamesToday
        rosteredTeams={rosteredTeams}
        onRefresh={fetchScores}
        onLiveGamesChange={handleLiveGamesChange}
      />

      {/* Leaderboard Summary - THE MAIN CONTENT */}
      <div className="chalk-box p-3 sm:p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {sortedRosters.map((roster, index) => {
            const pointChange =
              roster.previousTotal !== undefined ? roster.totalPoints - roster.previousTotal : null;
            const isUp = pointChange !== null && pointChange > 0;
            const totalProjected = roster.totalPoints + (roster.projectedPoints || 0);

            return (
              <div
                key={roster.ownerId}
                className={`p-3 rounded-lg text-center ${
                  index === 0
                    ? "bg-yellow-900/30 border border-yellow-500/30"
                    : "bg-[rgba(0,0,0,0.2)]"
                }`}
              >
                <div className="text-xs text-[var(--chalk-muted)]">#{index + 1}</div>
                <div className="font-bold text-[var(--chalk-white)] truncate text-sm sm:text-base">
                  {roster.ownerName}
                </div>
                <div className="text-lg font-bold text-[var(--chalk-green)] chalk-score">
                  {roster.totalPoints.toFixed(1)}
                </div>
                {showProjections &&
                  roster.projectedPoints !== undefined &&
                  roster.projectedPoints > 0 && (
                    <div className="text-xs text-[var(--chalk-blue)]">
                      Proj: {totalProjected.toFixed(1)}
                    </div>
                  )}
                <div className="text-xs text-[var(--chalk-muted)]">
                  {roster.activePlayers}/9 active
                </div>
                {isUp && (
                  <div className="text-xs text-green-400 animate-pulse">
                    +{pointChange.toFixed(1)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Compact controls row - inside the leaderboard box */}
        <div className="mt-3 pt-3 border-t border-dashed border-[var(--chalk-muted)]/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showProjections}
                onChange={(e) => setShowProjections(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-[var(--chalk-blue)]">Proj</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-[var(--chalk-muted)]">Auto</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            {hasLiveGames ? (
              <span className="text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                Live sync {countdown}s
              </span>
            ) : (
              <span className="text-[var(--chalk-muted)]">Refresh {countdown}s</span>
            )}
            <button
              onClick={() => handleSync(false)}
              disabled={syncing}
              className="text-[var(--chalk-blue)] hover:underline disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          </div>
        </div>
      </div>

      {/* All Rosters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {sortedRosters.map((roster, index) => (
          <div key={roster.ownerId} className="chalk-box p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                    index === 0
                      ? "bg-yellow-500 text-black"
                      : index === 1
                        ? "bg-gray-400 text-black"
                        : index === 2
                          ? "bg-orange-600 text-white"
                          : "bg-[rgba(255,255,255,0.1)] text-[var(--chalk-muted)]"
                  }`}
                >
                  {index + 1}
                </span>
                <div>
                  <span className="font-bold text-[var(--chalk-white)]">{roster.ownerName}</span>
                  <div className="text-xs text-[var(--chalk-muted)]">
                    {roster.activePlayers}/9 active
                  </div>
                </div>
              </div>
              <span className="text-xl font-bold text-[var(--chalk-green)] chalk-score">
                {roster.totalPoints.toFixed(1)}
              </span>
            </div>

            <div className="space-y-1">
              {roster.players.map((player) => {
                const pointChange =
                  player.previousPoints !== undefined
                    ? player.points - player.previousPoints
                    : null;
                const isUp = pointChange !== null && pointChange > 0.01;
                const posColor = POSITION_COLORS[player.position] || "text-[var(--chalk-white)]";
                const hasProjection =
                  player.projectedPoints !== undefined &&
                  player.projectedPoints !== null &&
                  player.projectedPoints > 0;
                const isInjured = player.hasSubstitution;

                return (
                  <Link
                    key={player.id}
                    href={`/player/${player.id}`}
                    className={`flex items-center justify-between py-1 px-2 rounded hover:bg-[rgba(255,255,255,0.05)] transition-colors ${
                      isUp ? "bg-green-900/20" : ""
                    } ${player.isEliminated || isInjured ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span
                        className={`text-xs font-mono w-6 ${posColor} ${isInjured ? "opacity-50" : ""}`}
                      >
                        {player.slot}
                      </span>
                      <span
                        className={`text-sm truncate ${isInjured ? "text-[var(--chalk-muted)] line-through" : "text-[var(--chalk-white)]"}`}
                      >
                        {player.name}
                      </span>
                      {isInjured && (
                        <span
                          className="text-[8px] text-orange-400 bg-orange-900/30 px-1 py-0.5 rounded"
                          title={player.substitution?.reason || "Injured - out for playoffs"}
                        >
                          INJ
                        </span>
                      )}
                      {player.isEliminated && !isInjured && (
                        <span className="text-[8px] text-red-400 bg-red-900/30 px-1 py-0.5 rounded">
                          OUT
                        </span>
                      )}
                      {/* Show substitute player */}
                      {player.substitution && (
                        <span className="flex items-center gap-1 text-xs">
                          <span className="text-[var(--chalk-muted)]">/</span>
                          <span
                            className="text-[var(--chalk-blue)] hover:text-[var(--chalk-pink)]"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.location.href = `/player/${player.substitution!.substitutePlayer.id}`;
                            }}
                          >
                            {player.substitution.substitutePlayer.name}
                          </span>
                          <span className="text-[8px] text-blue-400 bg-blue-900/30 px-1 py-0.5 rounded">
                            SUB
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {isUp && (
                        <span className="text-xs text-green-400 animate-pulse">
                          +{pointChange.toFixed(1)}
                        </span>
                      )}
                      {showProjections && hasProjection && (
                        <span className="text-xs text-[var(--chalk-blue)] mr-1">
                          +{player.projectedPoints!.toFixed(1)}
                        </span>
                      )}
                      <span
                        className={`text-sm font-bold ${
                          player.points > 0
                            ? "text-[var(--chalk-green)]"
                            : "text-[var(--chalk-muted)]"
                        }`}
                      >
                        {player.points.toFixed(1)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Loading overlay */}
      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <div className="text-[var(--chalk-muted)]">Loading scores...</div>
        </div>
      )}
    </div>
  );
}
