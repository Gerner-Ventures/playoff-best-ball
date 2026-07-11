"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";
import { EnhancedProjectionBreakdown } from "@/types";
import { ProjectionBreakdownCard, CompactProjectionBadge } from "@/components/projection-breakdown";
import { Tooltip, InfoIcon } from "@/components/ui/tooltip";
import { MethodologyModal, MethodologyButton } from "@/components/methodology-modal";
// Types for Rest of Playoffs view
interface WeekProjection {
  week: number;
  weekName: string;
  projectedPoints: number;
  advanceProb: number;
  expectedValue: number;
}
interface PlayerPlayoffProjection {
  id: string;
  name: string;
  position: string;
  team: string | null;
  slot: string;
  actualPoints: number;
  avgPointsPerGame: number;
  gamesPlayed: number;
  weeklyBreakdown: WeekProjection[];
  totalRemainingEV: number;
  champProb: number | null;
  // Enhanced projection data
  breakdown?: EnhancedProjectionBreakdown;
  source?: "prop" | "historical" | "blended";
  propCount?: number;
  confidence?: "high" | "medium" | "low";
}
interface OwnerPlayoffProjection {
  ownerId: string;
  ownerName: string;
  players: PlayerPlayoffProjection[];
  actualPoints: number;
  totalRemainingEV: number;
  totalProjectedPoints: number;
  activePlayers: number;
  eliminatedPlayers: number;
}
interface PlayoffsData {
  projections: OwnerPlayoffProjection[];
  completedWeeks: number[];
  remainingWeeks: number[];
  currentWeek: number;
  year: number;
  lastUpdated: string;
  eliminatedTeams?: string[];
  eliminatedCount?: number;
  byeTeams?: string[];
  oddsCount?: number;
  enhanced?: {
    enabled: boolean;
    includeBreakdown: boolean;
    propCoverage: {
      playersWithProps: number;
      totalPlayers: number;
      percentage: number;
    };
    weatherDataAvailable: boolean;
  };
}
// Types for Single Week view
interface SingleWeekPlayer {
  id: string;
  name: string;
  position: string;
  team: string | null;
  slot: string;
  actualPoints: number;
  projectedPoints: number;
  teamWinProb: number | null;
  expectedValue: number | null;
  opponent: string | null;
  isEliminated?: boolean;
  isByeWeek?: boolean;
  // Enhanced projection data
  historicalPoints?: number;
  propProjectedPoints?: number | null;
  confidence?: "high" | "medium" | "low";
  source?: "prop" | "historical" | "blended";
  propCount?: number;
  gamesPlayed?: number;
  propBreakdown?: { propType: string; line: number }[];
  // Substitution info
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
}
interface SingleWeekOwner {
  ownerId: string;
  ownerName: string;
  players: SingleWeekPlayer[];
  actualPoints: number;
  projectedPoints: number;
  expectedValue: number;
  totalExpectedValue: number;
}
interface SingleWeekData {
  projections: SingleWeekOwner[];
  week: number | null;
  year: number;
  byeTeams?: string[];
  eliminatedTeams?: string[];
  lastUpdated: string;
}
interface OddsData {
  odds: {
    team: string;
    opponent: string;
    winProb: number;
    moneyline: number | null;
  }[];
}
const weekNames: Record<number, string> = {
  1: "Wild Card",
  2: "Divisional",
  3: "Conference",
  5: "Super Bowl",
};
export default function ProjectionsPage() {
  const [viewMode, setViewMode] = useState<"playoffs" | "week">("playoffs");
  const [playoffsData, setPlayoffsData] = useState<PlayoffsData | null>(null);
  const [weekData, setWeekData] = useState<SingleWeekData | null>(null);
  const [odds, setOdds] = useState<OddsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(1); // Default to Wild Card
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [useEnhanced, setUseEnhanced] = useState(true); // Use prop-based projections
  const [propCoverage, setPropCoverage] = useState<number | null>(null);
  const [showMethodology, setShowMethodology] = useState(false); // Methodology modal
  const [showEVExplainer, setShowEVExplainer] = useState(false); // EV explanation modal
  const fetchPlayoffsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        year: String(CURRENT_SEASON_YEAR),
        useEnhanced: String(useEnhanced),
        includeBreakdown: "true", // Always include breakdown
      });
      const response = await fetch(`/api/projections/playoffs?${params}`);
      if (!response.ok) throw new Error("Failed to fetch playoff projections");
      const data = await response.json();
      setPlayoffsData(data);
      // Update prop coverage from enhanced metadata
      if (data.enhanced?.propCoverage) {
        setPropCoverage(data.enhanced.propCoverage.percentage);
      }
      // Also fetch odds for display
      const oddsRes = await fetch(`/api/odds?year=${CURRENT_SEASON_YEAR}`);
      if (oddsRes.ok) {
        setOdds(await oddsRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [useEnhanced]);
  const fetchWeekData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const endpoint = useEnhanced
        ? `/api/projections/enhanced?year=${CURRENT_SEASON_YEAR}&week=${selectedWeek}`
        : `/api/projections?year=${CURRENT_SEASON_YEAR}&week=${selectedWeek}`;
      const [projectionsRes, oddsRes] = await Promise.all([
        fetch(endpoint),
        fetch(`/api/odds?year=${CURRENT_SEASON_YEAR}&week=${selectedWeek}`),
      ]);
      if (!projectionsRes.ok) throw new Error("Failed to fetch projections");
      const data = await projectionsRes.json();
      setWeekData(data);
      // Track prop coverage from enhanced endpoint
      if (data.stats?.propCoverage !== undefined) {
        setPropCoverage(data.stats.propCoverage);
      } else {
        setPropCoverage(null);
      }
      if (oddsRes.ok) {
        setOdds(await oddsRes.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [selectedWeek, useEnhanced]);
  useEffect(() => {
    if (viewMode === "playoffs") {
      fetchPlayoffsData();
    } else {
      fetchWeekData();
    }
  }, [viewMode, fetchPlayoffsData, fetchWeekData]);
  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      if (viewMode === "playoffs") {
        // For playoffs view, sync odds for current week (determined by API)
        // The Odds API only returns upcoming games, so we sync to week 1 (Wild Card)
        const currentWeek = playoffsData?.currentWeek || 1;
        await fetch(`/api/odds?year=${CURRENT_SEASON_YEAR}&week=${currentWeek}`, {
          method: "POST",
        });
        // Sync projections for current week
        await fetch(`/api/projections/sync?year=${CURRENT_SEASON_YEAR}&week=${currentWeek}`, {
          method: "POST",
        });
        await fetchPlayoffsData();
      } else {
        // For single week view, sync for selected week
        await fetch(`/api/odds?year=${CURRENT_SEASON_YEAR}&week=${selectedWeek}`, {
          method: "POST",
        });
        // Also sync props if using enhanced mode
        if (useEnhanced) {
          await fetch(
            `/api/props?year=${CURRENT_SEASON_YEAR}&week=${selectedWeek}&rosteredOnly=true`,
            {
              method: "POST",
            }
          );
        }
        await fetch(`/api/projections/sync?year=${CURRENT_SEASON_YEAR}&week=${selectedWeek}`, {
          method: "POST",
        });
        await fetchWeekData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync");
    } finally {
      setSyncing(false);
    }
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-[var(--chalk-muted)]">Loading projections...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {/* Methodology Modal */}
      <MethodologyModal isOpen={showMethodology} onClose={() => setShowMethodology(false)} />
      {/* EV Explainer Modal */}
      <EVExplainerModal isOpen={showEVExplainer} onClose={() => setShowEVExplainer(false)} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-[var(--chalk-yellow)] chalk-text">
              Projections
            </h1>
            <MethodologyButton onClick={() => setShowMethodology(true)} />
          </div>
          <p className="text-sm text-[var(--chalk-muted)] mt-1">
            {viewMode === "playoffs"
              ? "Projected points for rest of playoffs"
              : `Projected points for ${weekNames[selectedWeek]}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* View Mode Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-[var(--chalk-border)]">
            <button
              onClick={() => setViewMode("playoffs")}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm transition-colors min-h-[44px] ${
                viewMode === "playoffs"
                  ? "bg-[var(--chalk-yellow)] text-black font-semibold"
                  : "bg-[var(--chalk-surface)] text-[var(--chalk-text)] hover:bg-[var(--chalk-border)]"
              }`}
            >
              <span className="hidden sm:inline">Rest of </span>Playoffs
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm transition-colors min-h-[44px] ${
                viewMode === "week"
                  ? "bg-[var(--chalk-yellow)] text-black font-semibold"
                  : "bg-[var(--chalk-surface)] text-[var(--chalk-text)] hover:bg-[var(--chalk-border)]"
              }`}
            >
              <span className="hidden sm:inline">Single </span>Week
            </button>
          </div>
          {/* Enhanced projections toggle for both views */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={useEnhanced}
              onChange={(e) => setUseEnhanced(e.target.checked)}
              className="rounded border-[var(--chalk-border)]"
            />
            <span className="text-[var(--chalk-muted)]">
              Prop-based
              {propCoverage !== null && (
                <span className="ml-1 text-xs text-[var(--chalk-green)]">({propCoverage}%)</span>
              )}
            </span>
          </label>
          {viewMode === "week" && (
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="bg-[var(--chalk-surface)] border border-[var(--chalk-border)] rounded px-3 py-2 text-sm text-[var(--chalk-text)] min-h-[44px]"
            >
              {[1, 2, 3, 5].map((week) => (
                <option key={week} value={week}>
                  {weekNames[week]}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-green-800 rounded transition-colors min-h-[44px]"
          >
            {syncing ? "..." : "Sync"}
          </button>
        </div>
      </div>
      {viewMode === "playoffs" && playoffsData && (
        <PlayoffsView
          data={playoffsData}
          expandedOwner={expandedOwner}
          setExpandedOwner={setExpandedOwner}
          expandedPlayer={expandedPlayer}
          setExpandedPlayer={setExpandedPlayer}
          onEVClick={() => setShowEVExplainer(true)}
        />
      )}
      {viewMode === "week" && weekData && (
        <SingleWeekView data={weekData} odds={odds} onEVClick={() => setShowEVExplainer(true)} />
      )}
    </div>
  );
}
// Rest of Playoffs View Component
function PlayoffsView({
  data,
  expandedOwner,
  setExpandedOwner,
  expandedPlayer,
  setExpandedPlayer,
  onEVClick,
}: {
  data: PlayoffsData;
  expandedOwner: string | null;
  setExpandedOwner: (id: string | null) => void;
  expandedPlayer: string | null;
  setExpandedPlayer: (id: string | null) => void;
  onEVClick: () => void;
}) {
  // Find expanded player's breakdown data
  const expandedPlayerData = expandedPlayer
    ? data.projections.flatMap((o) => o.players).find((p) => p.id === expandedPlayer)
    : null;
  return (
    <>
      {/* Playoff Status */}
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-[var(--chalk-muted)]">Completed:</span>
        {data.completedWeeks.length === 0 ? (
          <span className="px-2 py-0.5 bg-gray-800 text-gray-400 rounded">None</span>
        ) : (
          data.completedWeeks.map((w) => (
            <span key={w} className="px-2 py-0.5 bg-green-900/30 text-green-400 rounded">
              {weekNames[w]}
            </span>
          ))
        )}
        <span className="text-[var(--chalk-muted)] ml-2">Remaining:</span>
        {data.remainingWeeks.map((w) => (
          <span key={w} className="px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded">
            {weekNames[w]}
          </span>
        ))}
      </div>
      {/* Debug Info */}
      <div className="flex flex-wrap gap-4 text-xs bg-[var(--chalk-surface)] p-2 rounded">
        <span>
          <span className="text-[var(--chalk-muted)]">Eliminated:</span>{" "}
          <span className="text-red-400">{data.eliminatedCount ?? "?"}</span>
          {data.eliminatedTeams && data.eliminatedTeams.length > 0 && (
            <span className="text-[var(--chalk-muted)] ml-1">
              ({data.eliminatedTeams.join(", ")})
            </span>
          )}
        </span>
        {data.byeTeams && data.byeTeams.length > 0 && (
          <span>
            <span className="text-[var(--chalk-muted)]">Bye Teams:</span>{" "}
            <span className="text-purple-400">{data.byeTeams.join(", ")}</span>
          </span>
        )}
        <span>
          <span className="text-[var(--chalk-muted)]">Odds in DB:</span>{" "}
          <span
            className={data.oddsCount && data.oddsCount > 0 ? "text-green-400" : "text-yellow-400"}
          >
            {data.oddsCount ?? "0"}
          </span>
        </span>
        <span>
          <span className="text-[var(--chalk-muted)]">Year:</span>{" "}
          <span className="text-[var(--chalk-text)]">{data.year}</span>
        </span>
        {data.enhanced && (
          <>
            <span>
              <span className="text-[var(--chalk-muted)]">Props:</span>{" "}
              <span className="text-[var(--chalk-blue)]">
                {data.enhanced.propCoverage.playersWithProps}/
                {data.enhanced.propCoverage.totalPlayers}
              </span>
              <span className="text-[var(--chalk-muted)] ml-1">
                ({data.enhanced.propCoverage.percentage}%)
              </span>
            </span>
            {data.enhanced.weatherDataAvailable && (
              <span className="text-[var(--chalk-green)]">Weather</span>
            )}
          </>
        )}
      </div>
      {/* Expanded Player Breakdown Card */}
      {expandedPlayerData && expandedPlayerData.breakdown && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedPlayer(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="max-w-lg w-full">
            <ProjectionBreakdownCard
              playerName={expandedPlayerData.name}
              position={expandedPlayerData.position}
              team={expandedPlayerData.team}
              breakdown={expandedPlayerData.breakdown}
              onClose={() => setExpandedPlayer(null)}
            />
          </div>
        </div>
      )}
      {/* Main Leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-lg font-semibold text-[var(--chalk-text)]">
            Rest of Playoffs Leaderboard
          </h2>
        </CardHeader>
        <CardContent>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {data.projections.map((owner, index) => {
              const totalProjected = owner.actualPoints + owner.totalProjectedPoints;
              return (
                <div
                  key={owner.ownerId}
                  className={`p-3 rounded-lg cursor-pointer ${
                    index === 0
                      ? "bg-yellow-900/30 border border-yellow-500/30"
                      : "bg-[rgba(0,0,0,0.2)] border border-[var(--chalk-muted)]/20"
                  }`}
                  onClick={() =>
                    setExpandedOwner(expandedOwner === owner.ownerId ? null : owner.ownerId)
                  }
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <RankBadge rank={index + 1} />
                      <span className="font-semibold text-[var(--chalk-text)]">
                        {owner.ownerName}
                      </span>
                      <span className="text-xs text-[var(--chalk-muted)]">
                        {expandedOwner === owner.ownerId ? "▼" : "▶"}
                      </span>
                    </div>
                    <div className="text-xl font-bold text-[var(--chalk-green)]">
                      {totalProjected.toFixed(1)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-[var(--chalk-muted)]">Actual</div>
                      <div className="text-[var(--chalk-text)]">
                        {owner.actualPoints.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--chalk-muted)]">+Proj</div>
                      <div className="text-[var(--chalk-blue)]">
                        +{owner.totalProjectedPoints.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--chalk-muted)]">Active</div>
                      <div>
                        <span className="text-[var(--chalk-green)]">{owner.activePlayers}</span>
                        <span className="text-[var(--chalk-muted)]">/</span>
                        <span className="text-red-400">{owner.eliminatedPlayers}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--chalk-border)]">
                  <th className="text-left py-2 px-2 text-[var(--chalk-muted)]">Rank</th>
                  <th className="text-left py-2 px-2 text-[var(--chalk-muted)]">Owner</th>
                  <th className="text-right py-2 px-2 text-[var(--chalk-muted)]">
                    <Tooltip content="Points already scored this playoffs">
                      <span className="flex items-center justify-end gap-1 cursor-help">
                        Actual <InfoIcon className="w-3 h-3" />
                      </span>
                    </Tooltip>
                  </th>
                  <th className="text-right py-2 px-2 text-[var(--chalk-muted)]">
                    <Tooltip content="Projected points for remaining playoff games">
                      <span className="flex items-center justify-end gap-1 cursor-help">
                        Remaining <InfoIcon className="w-3 h-3" />
                      </span>
                    </Tooltip>
                  </th>
                  <th className="text-right py-2 px-2 text-[var(--chalk-muted)]">
                    <Tooltip content="Actual points + Projected remaining points">
                      <span className="flex items-center justify-end gap-1 cursor-help">
                        Total Proj <InfoIcon className="w-3 h-3" />
                      </span>
                    </Tooltip>
                  </th>
                  <th className="text-center py-2 px-2 text-[var(--chalk-muted)]">
                    <Tooltip content="Active players still in playoffs / Eliminated players">
                      <span className="flex items-center justify-center gap-1 cursor-help">
                        Active <InfoIcon className="w-3 h-3" />
                      </span>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.projections.map((owner, index) => {
                  const totalProjected = owner.actualPoints + owner.totalProjectedPoints;
                  return (
                    <tr
                      key={owner.ownerId}
                      className="border-b border-[var(--chalk-border)]/50 hover:bg-[var(--chalk-surface)] cursor-pointer"
                      onClick={() =>
                        setExpandedOwner(expandedOwner === owner.ownerId ? null : owner.ownerId)
                      }
                    >
                      <td className="py-3 px-2">
                        <RankBadge rank={index + 1} />
                      </td>
                      <td className="py-3 px-2 font-semibold text-[var(--chalk-text)]">
                        <div className="flex items-center gap-2">
                          {owner.ownerName}
                          <span className="text-xs text-[var(--chalk-muted)]">
                            {expandedOwner === owner.ownerId ? "▼" : "▶"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right text-[var(--chalk-text)]">
                        {owner.actualPoints.toFixed(1)}
                      </td>
                      <td className="py-3 px-2 text-right text-[var(--chalk-blue)]">
                        +{owner.totalProjectedPoints.toFixed(1)}
                      </td>
                      <td className="py-3 px-2 text-right font-bold text-[var(--chalk-green)] text-lg">
                        {totalProjected.toFixed(1)}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className="text-[var(--chalk-green)]">{owner.activePlayers}</span>
                        <span className="text-[var(--chalk-muted)]">/</span>
                        <span className="text-red-400">{owner.eliminatedPlayers}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {/* Expanded Owner Details */}
      {expandedOwner && (
        <OwnerPlayoffDetails
          owner={data.projections.find((o) => o.ownerId === expandedOwner)!}
          remainingWeeks={data.remainingWeeks}
          onEVClick={onEVClick}
        />
      )}
      {/* All Owner Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.projections.map((owner, rank) => (
          <OwnerPlayoffCard
            key={owner.ownerId}
            owner={owner}
            rank={rank}
            onPlayerClick={setExpandedPlayer}
            onEVClick={onEVClick}
          />
        ))}
      </div>
    </>
  );
}
// Owner Playoff Card Component - Mobile optimized
function OwnerPlayoffCard({
  owner,
  rank,
  onPlayerClick,
  onEVClick,
}: {
  owner: OwnerPlayoffProjection;
  rank: number;
  onPlayerClick?: (playerId: string) => void;
  onEVClick?: () => void;
}) {
  const totalProjected = owner.actualPoints + owner.totalProjectedPoints;
  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <RankBadge rank={rank + 1} />
            <h3 className="text-base sm:text-lg font-bold text-[var(--chalk-yellow)] truncate">
              {owner.ownerName}
            </h3>
          </div>
          <div className="text-right flex-shrink-0">
            <Tooltip content="Actual points + Projected remaining points">
              <span className="text-xl sm:text-2xl font-bold text-[var(--chalk-green)] cursor-help">
                {totalProjected.toFixed(1)}
              </span>
            </Tooltip>
            <div className="text-[10px] sm:text-xs text-[var(--chalk-muted)]">Total Proj</div>
          </div>
        </div>
        {/* Stats row - stacked on mobile */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--chalk-muted)] mt-2">
          <span>
            Actual:{" "}
            <span className="text-[var(--chalk-text)]">{owner.actualPoints.toFixed(1)}</span>
          </span>
          <Tooltip content="Projected points for remaining playoff games">
            <span className="cursor-help">
              +Proj:{" "}
              <span className="text-[var(--chalk-blue)]">
                {owner.totalProjectedPoints.toFixed(1)}
              </span>
            </span>
          </Tooltip>
          <span>
            <span className="text-[var(--chalk-green)]">{owner.activePlayers}</span>
            <span className="text-[var(--chalk-muted)]">/</span>
            <span className="text-red-400">{owner.eliminatedPlayers}</span>
            <span className="ml-1">players</span>
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {/* Player list */}
        <div className="space-y-0.5">
          {owner.players.slice(0, 9).map((player) => {
            const totalRemaining = player.weeklyBreakdown.reduce(
              (sum, week) => sum + week.projectedPoints,
              0
            );
            return (
              <div
                key={player.id}
                className={`flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--chalk-surface)] cursor-pointer ${
                  totalRemaining === 0 ? "opacity-50" : ""
                }`}
                onClick={() => {
                  if (player.breakdown && onPlayerClick) {
                    onPlayerClick(player.id);
                  }
                }}
              >
                {/* Left side: position, name, team */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="w-7 text-[10px] sm:text-xs font-medium text-[var(--chalk-muted)] flex-shrink-0">
                    {player.slot}
                  </span>
                  <Link
                    href={`/player/${player.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs sm:text-sm text-[var(--chalk-text)] hover:text-[var(--chalk-blue)] transition-colors truncate"
                  >
                    {player.name}
                  </Link>
                  {player.team && (
                    <span className="text-[10px] text-[var(--chalk-muted)] flex-shrink-0 hidden sm:inline">
                      {player.team}
                    </span>
                  )}
                  {/* Projection source and confidence badge */}
                  {player.source && player.confidence && (
                    <CompactProjectionBadge
                      source={player.source}
                      confidence={player.confidence}
                      propCount={player.propCount}
                    />
                  )}
                </div>
                {/* Right side: actual points and remaining projected */}
                <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm flex-shrink-0">
                  <span className="text-[var(--chalk-text)] w-8 sm:w-10 text-right">
                    {player.actualPoints.toFixed(1)}
                  </span>
                  <Tooltip content={`Projected: ${player.avgPointsPerGame.toFixed(1)}/game`}>
                    <span className="text-[var(--chalk-green)] w-10 sm:w-12 text-right font-medium cursor-help">
                      +{totalRemaining.toFixed(1)}
                    </span>
                  </Tooltip>
                  {player.breakdown && <span className="text-[var(--chalk-muted)] text-xs">›</span>}
                </div>
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex justify-between mt-3 pt-2 border-t border-[var(--chalk-border)]/50 text-[10px] sm:text-xs text-[var(--chalk-muted)]">
          <span>Actual pts</span>
          <span className="text-[var(--chalk-green)]">+Remaining Proj</span>
        </div>
      </CardContent>
    </Card>
  );
}
// Expanded Owner Details
function OwnerPlayoffDetails({
  owner,
  remainingWeeks,
  onEVClick,
}: {
  owner: OwnerPlayoffProjection;
  remainingWeeks: number[];
  onEVClick?: () => void;
}) {
  return (
    <Card className="border-2 border-[var(--chalk-yellow)]">
      <CardHeader>
        <h3 className="text-xl font-bold text-[var(--chalk-yellow)]">
          {owner.ownerName} - Week by Week Breakdown
        </h3>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--chalk-border)]">
                <th className="text-left py-2 px-2 text-[var(--chalk-muted)]">Player</th>
                <th className="text-right py-2 px-2 text-[var(--chalk-muted)]">Actual</th>
                <th className="text-right py-2 px-2 text-[var(--chalk-muted)]">Avg/G</th>
                {remainingWeeks.map((w) => (
                  <th key={w} className="text-right py-2 px-2 text-[var(--chalk-muted)]">
                    {weekNames[w]}
                  </th>
                ))}
                <th className="text-right py-2 px-2 text-[var(--chalk-muted)]">Total Proj</th>
              </tr>
            </thead>
            <tbody>
              {owner.players.map((player) => {
                const totalRemaining = player.weeklyBreakdown.reduce(
                  (sum, week) => sum + week.projectedPoints,
                  0
                );
                return (
                  <tr
                    key={player.id}
                    className={`border-b border-[var(--chalk-border)]/50 ${
                      totalRemaining === 0 ? "opacity-50" : ""
                    }`}
                  >
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--chalk-muted)]">{player.slot}</span>
                        <Link
                          href={`/player/${player.id}`}
                          className="text-[var(--chalk-text)] hover:text-[var(--chalk-blue)]"
                        >
                          {player.name}
                        </Link>
                        {player.team && (
                          <span className="text-xs text-[var(--chalk-muted)]">{player.team}</span>
                        )}
                        {/* Projection source and confidence badge */}
                        {player.source && player.confidence && (
                          <CompactProjectionBadge
                            source={player.source}
                            confidence={player.confidence}
                            propCount={player.propCount}
                          />
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right text-[var(--chalk-text)]">
                      {player.actualPoints.toFixed(1)}
                    </td>
                    <td className="py-2 px-2 text-right text-[var(--chalk-muted)]">
                      {player.avgPointsPerGame.toFixed(1)}
                    </td>
                    {remainingWeeks.map((w) => {
                      const weekData = player.weeklyBreakdown.find((wb) => wb.week === w);
                      return (
                        <td key={w} className="py-2 px-2 text-right">
                          {weekData ? (
                            <div className="text-[var(--chalk-green)]">
                              {weekData.projectedPoints.toFixed(1)}
                            </div>
                          ) : (
                            <span className="text-[var(--chalk-muted)]">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 text-right font-bold text-[var(--chalk-green)]">
                      {player.weeklyBreakdown
                        .reduce((sum, week) => sum + week.projectedPoints, 0)
                        .toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
// Single Week View Component (Original)
function SingleWeekView({
  data,
  odds,
  onEVClick,
}: {
  data: SingleWeekData;
  odds: OddsData | null;
  onEVClick: () => void;
}) {
  const isWildCard = data.week === 1;
  return (
    <>
      {/* Week Info */}
      {data.byeTeams && data.byeTeams.length > 0 && isWildCard && (
        <div className="flex flex-wrap gap-4 text-xs bg-[var(--chalk-surface)] p-2 rounded">
          <span>
            <span className="text-[var(--chalk-muted)]">Bye Teams:</span>{" "}
            <span className="text-purple-400">{data.byeTeams.join(", ")}</span>
            <span className="text-[var(--chalk-muted)] ml-1">(skip Wild Card)</span>
          </span>
          {data.eliminatedTeams && data.eliminatedTeams.length > 0 && (
            <span>
              <span className="text-[var(--chalk-muted)]">Eliminated:</span>{" "}
              <span className="text-red-400">{data.eliminatedTeams.join(", ")}</span>
            </span>
          )}
        </div>
      )}
      {/* Team Odds Summary */}
      {odds && odds.odds.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-lg font-semibold text-[var(--chalk-text)]">Matchups</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {odds.odds
                .filter((o, i, arr) => arr.findIndex((x) => x.team === o.opponent) > i)
                .map((game) => {
                  const opponent = odds.odds.find((o) => o.team === game.opponent);
                  return (
                    <div
                      key={`${game.team}-${game.opponent}`}
                      className="bg-[var(--chalk-surface)] rounded-lg p-3"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-[var(--chalk-text)]">{game.team}</span>
                        <span className="text-sm text-[var(--chalk-green)]">
                          {(game.winProb * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--chalk-green)]"
                          style={{ width: `${game.winProb * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="font-semibold text-[var(--chalk-text)]">
                          {game.opponent}
                        </span>
                        <span className="text-sm text-[var(--chalk-blue)]">
                          {opponent ? (opponent.winProb * 100).toFixed(0) : "?"}%
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
      {/* Leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-lg font-semibold text-[var(--chalk-text)]">
            Expected Value Leaderboard
          </h2>
        </CardHeader>
        <CardContent>
          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {data.projections.map((owner, index) => {
              const totalProjected = owner.actualPoints + owner.projectedPoints;
              return (
                <div
                  key={owner.ownerId}
                  className={`p-3 rounded-lg ${
                    index === 0
                      ? "bg-yellow-900/30 border border-yellow-500/30"
                      : "bg-[rgba(0,0,0,0.2)] border border-[var(--chalk-muted)]/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <RankBadge rank={index + 1} />
                      <span className="font-semibold text-[var(--chalk-text)]">
                        {owner.ownerName}
                      </span>
                    </div>
                    <div className="text-xl font-bold text-[var(--chalk-green)]">
                      {totalProjected.toFixed(1)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-[var(--chalk-muted)]">Actual</div>
                      <div className="text-[var(--chalk-text)]">
                        {owner.actualPoints.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--chalk-muted)]">Projected</div>
                      <div className="text-[var(--chalk-blue)]">
                        {owner.projectedPoints.toFixed(1)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--chalk-border)]">
                  <th className="text-left py-2 px-2 text-[var(--chalk-muted)]">Rank</th>
                  <th className="text-left py-2 px-2 text-[var(--chalk-muted)]">Owner</th>
                  <th className="text-right py-2 px-2 text-[var(--chalk-muted)]">
                    <Tooltip content="Points already scored this week">
                      <span className="flex items-center justify-end gap-1 cursor-help">
                        Actual <InfoIcon className="w-3 h-3" />
                      </span>
                    </Tooltip>
                  </th>
                  <th className="text-right py-2 px-2 text-[var(--chalk-muted)]">
                    <Tooltip content="Estimated points if all players' teams win. Based on props and/or historical averages.">
                      <span className="flex items-center justify-end gap-1 cursor-help">
                        Projected <InfoIcon className="w-3 h-3" />
                      </span>
                    </Tooltip>
                  </th>
                  <th className="text-right py-2 px-2 text-[var(--chalk-muted)]">
                    <Tooltip content="Actual points + Projected points for this week">
                      <span className="flex items-center justify-end gap-1 cursor-help">
                        Total Proj <InfoIcon className="w-3 h-3" />
                      </span>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.projections.map((owner, index) => {
                  const totalProjected = owner.actualPoints + owner.projectedPoints;
                  return (
                    <tr
                      key={owner.ownerId}
                      className="border-b border-[var(--chalk-border)]/50 hover:bg-[var(--chalk-surface)]"
                    >
                      <td className="py-2 px-2">
                        <RankBadge rank={index + 1} />
                      </td>
                      <td className="py-2 px-2 font-semibold text-[var(--chalk-text)]">
                        {owner.ownerName}
                      </td>
                      <td className="py-2 px-2 text-right text-[var(--chalk-text)]">
                        {owner.actualPoints.toFixed(1)}
                      </td>
                      <td className="py-2 px-2 text-right text-[var(--chalk-blue)]">
                        {owner.projectedPoints.toFixed(1)}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-[var(--chalk-green)]">
                        {totalProjected.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {/* Owner Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.projections.map((owner, rank) => {
          const totalProjected = owner.actualPoints + owner.projectedPoints;
          return (
            <Card key={owner.ownerId}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RankBadge rank={rank + 1} />
                    <h3 className="text-lg font-bold text-[var(--chalk-yellow)]">
                      {owner.ownerName}
                    </h3>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-[var(--chalk-green)]">
                      {totalProjected.toFixed(1)}
                    </div>
                    <div className="text-xs text-[var(--chalk-muted)]">Total Proj</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {owner.players.map((player) => (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between py-1 px-2 rounded hover:bg-[var(--chalk-surface)] ${
                        player.isEliminated || player.isInjured ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                        <span
                          className={`w-8 text-xs font-medium text-[var(--chalk-muted)] ${player.isInjured ? "opacity-50" : ""}`}
                        >
                          {player.slot}
                        </span>
                        <Link
                          href={`/player/${player.id}`}
                          className={`text-sm transition-colors truncate ${
                            player.isInjured
                              ? "text-[var(--chalk-muted)] line-through"
                              : "text-[var(--chalk-text)] hover:text-[var(--chalk-blue)]"
                          }`}
                        >
                          {player.name}
                        </Link>
                        {player.isInjured && (
                          <span
                            className="text-[8px] text-orange-400 bg-orange-900/30 px-1 py-0.5 rounded"
                            title={player.substitution?.reason || "Injured - out for playoffs"}
                          >
                            INJ
                          </span>
                        )}
                        {player.isEliminated && !player.isInjured && (
                          <span className="text-[8px] text-red-400 px-1 py-0.5 bg-red-900/30 rounded">
                            OUT
                          </span>
                        )}
                        {player.isByeWeek && !player.isInjured && (
                          <span className="text-[8px] text-purple-400 px-1 py-0.5 bg-purple-900/30 rounded">
                            BYE
                          </span>
                        )}
                        {/* Show substitute player */}
                        {player.isInjured && player.substitution && (
                          <span className="flex items-center gap-1 text-xs">
                            <span className="text-[var(--chalk-muted)]">/</span>
                            <Link
                              href={`/player/${player.substitution.substitutePlayer.id}`}
                              className="text-[var(--chalk-blue)] hover:text-[var(--chalk-pink)] hover:underline"
                            >
                              {player.substitution.substitutePlayer.name}
                            </Link>
                            <span className="text-[8px] text-blue-400 bg-blue-900/30 px-1 py-0.5 rounded">
                              SUB
                            </span>
                          </span>
                        )}
                        {/* Projection source and confidence badge */}
                        {player.source && player.confidence && (
                          <CompactProjectionBadge
                            source={player.source}
                            confidence={player.confidence}
                            propCount={player.propCount}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm flex-shrink-0">
                        <span className="text-[var(--chalk-text)] w-12 text-right">
                          {player.actualPoints.toFixed(1)}
                        </span>
                        {player.isByeWeek ? (
                          <span className="w-12 text-right font-medium text-purple-400">BYE</span>
                        ) : player.projectedPoints !== null &&
                          player.projectedPoints !== undefined ? (
                          <span className="w-12 text-right font-medium text-[var(--chalk-green)]">
                            {player.projectedPoints.toFixed(1)}
                          </span>
                        ) : (
                          <span className="w-12 text-right font-medium text-[var(--chalk-muted)]">
                            -
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
// EV Explainer Modal
function EVExplainerModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--chalk-surface)] border border-[var(--chalk-border)] rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[var(--chalk-surface)] border-b border-[var(--chalk-border)] p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--chalk-yellow)]">
            Understanding Expected Value (EV)
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--chalk-muted)] hover:text-[var(--chalk-text)] p-1 rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        {/* Content */}
        <div className="p-6 space-y-6">
          {/* What is EV */}
          <section>
            <h3 className="text-lg font-semibold text-[var(--chalk-blue)] mb-2">
              What is Expected Value?
            </h3>
            <p className="text-[var(--chalk-text)] text-sm leading-relaxed">
              Expected Value (EV) is a statistical measure that represents the average outcome you
              would expect over many trials. In fantasy football, it combines a player&apos;s
              projected points with the probability their team will actually play.
            </p>
          </section>
          {/* The Formula */}
          <section>
            <h3 className="text-lg font-semibold text-[var(--chalk-blue)] mb-2">The Formula</h3>
            <div className="bg-[rgba(0,0,0,0.3)] rounded-lg p-4 font-mono text-center">
              <span className="text-[var(--chalk-green)]">EV</span>
              <span className="text-[var(--chalk-muted)]"> = </span>
              <span className="text-[var(--chalk-yellow)]">Projected Points</span>
              <span className="text-[var(--chalk-muted)]"> × </span>
              <span className="text-[var(--chalk-blue)]">Win Probability</span>
            </div>
          </section>
          {/* Example */}
          <section>
            <h3 className="text-lg font-semibold text-[var(--chalk-blue)] mb-2">Example</h3>
            <div className="bg-[rgba(0,0,0,0.2)] rounded-lg p-4 space-y-2 text-sm">
              <p className="text-[var(--chalk-muted)]">
                A player is projected for{" "}
                <span className="text-[var(--chalk-yellow)]">15 points</span>
              </p>
              <p className="text-[var(--chalk-muted)]">
                Their team has a <span className="text-[var(--chalk-blue)]">60% chance</span> to win
                this week
              </p>
              <div className="pt-2 border-t border-[var(--chalk-border)]">
                <span className="text-[var(--chalk-muted)]">EV = 15 × 0.60 = </span>
                <span className="text-[var(--chalk-green)] font-bold">9.0 points</span>
              </div>
              <p className="text-xs text-[var(--chalk-muted)] italic mt-2">
                This means on average, you would expect this player to contribute 9 points when
                accounting for the risk their team might lose.
              </p>
            </div>
          </section>
          {/* Cumulative EV */}
          <section>
            <h3 className="text-lg font-semibold text-[var(--chalk-blue)] mb-2">
              Cumulative Advance Probability
            </h3>
            <p className="text-[var(--chalk-text)] text-sm leading-relaxed mb-3">
              For future playoff rounds, we multiply win probabilities together to get the
              cumulative chance a team reaches that round:
            </p>
            <div className="bg-[rgba(0,0,0,0.2)] rounded-lg p-4 space-y-2 text-sm">
              <p className="text-[var(--chalk-muted)]">
                If a team has <span className="text-[var(--chalk-blue)]">70%</span> to win Wild Card
                and <span className="text-[var(--chalk-blue)]">50%</span> to win Divisional:
              </p>
              <p className="text-[var(--chalk-muted)]">
                Championship round EV uses:{" "}
                <span className="text-[var(--chalk-yellow)]">70% × 50% = 35%</span>
              </p>
            </div>
          </section>
          {/* Types of EV */}
          <section>
            <h3 className="text-lg font-semibold text-[var(--chalk-blue)] mb-2">
              EV Types on This Page
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="text-[var(--chalk-green)] font-bold whitespace-nowrap">
                  Remaining EV
                </span>
                <span className="text-[var(--chalk-muted)]">
                  Sum of expected values for all future playoff rounds
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-[var(--chalk-green)] font-bold whitespace-nowrap">
                  Total EV
                </span>
                <span className="text-[var(--chalk-muted)]">
                  Actual points scored + Remaining EV (best estimate of final total)
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-[var(--chalk-green)] font-bold whitespace-nowrap">
                  Week EV
                </span>
                <span className="text-[var(--chalk-muted)]">
                  Expected value for a single playoff week
                </span>
              </div>
            </div>
          </section>
          {/* Why it matters */}
          <section className="bg-[var(--chalk-blue)]/10 border border-[var(--chalk-blue)]/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-[var(--chalk-blue)] mb-2">
              Why EV Matters in Best Ball
            </h3>
            <p className="text-xs text-[var(--chalk-text)] leading-relaxed">
              Best Ball playoffs use single elimination for NFL teams. A player on an underdog team
              might have high projected points but low EV because their team is unlikely to advance.
              EV helps you understand the true value of your roster by weighing upside against risk.
            </p>
          </section>
        </div>
        {/* Footer */}
        <div className="border-t border-[var(--chalk-border)] p-4">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-[var(--chalk-blue)] text-white rounded-lg hover:bg-[var(--chalk-blue)]/80 transition-colors text-sm font-medium"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
// EV Value Component with tooltip
function EVValue({
  value,
  prefix = "",
  className = "",
  tooltip = "Projected Points × Win Probability",
}: {
  value: number | null;
  prefix?: string;
  className?: string;
  tooltip?: string;
}) {
  if (value === null) {
    return <span className={`text-[var(--chalk-muted)] ${className}`}>-</span>;
  }
  return (
    <Tooltip content={tooltip}>
      <span className={`cursor-help ${className}`}>
        {prefix}
        {value.toFixed(1)}
      </span>
    </Tooltip>
  );
}
// Rank Badge Component
function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
        rank === 1
          ? "bg-yellow-500/20 text-yellow-400"
          : rank === 2
            ? "bg-gray-400/20 text-gray-300"
            : rank === 3
              ? "bg-amber-600/20 text-amber-500"
              : "bg-[var(--chalk-surface)] text-[var(--chalk-muted)]"
      }`}
    >
      {rank}
    </span>
  );
}
