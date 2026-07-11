"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";

// Types
interface HealthData {
  status: "healthy" | "warning" | "error";
  lastSync: string | null;
  lastSyncAge: number | null;
  weekCoverage: {
    week: number;
    label: string;
    scoresCount: number;
    hasData: boolean;
  }[];
  stats: {
    totalPlayers: number;
    playersWithEspnId: number;
    playersWithoutEspnId: number;
    totalOwners: number;
    totalRosters: number;
    eliminatedTeams: number;
    activeTeams: number;
    playersOnActiveTeams: number;
    playersOnEliminatedTeams: number;
    unmatchedOnActiveTeams: number;
  };
  eliminatedTeamsList: string[];
  alerts: { type: "warning" | "error" | "info"; message: string }[];
}

interface RosterPlayer {
  rosterId: string;
  playerId: string;
  name: string;
  position: string;
  team: string | null;
  espnId: string | null;
  rosterSlot: string;
  totalPoints: number;
  isEliminated: boolean;
  hasEspnId: boolean;
  // Substitution data
  hasSubstitution?: boolean;
  substitution?: {
    id: string;
    effectiveWeek: number;
    reason: string | null;
    isActive: boolean;
    substitutePlayer: {
      id: string;
      name: string;
      position: string;
      team: string | null;
      espnId: string | null;
    };
    pointsBreakdown?: {
      originalPoints: number;
      substitutePoints: number;
    };
  } | null;
}

interface RosterData {
  ownerId: string;
  ownerName: string;
  players: RosterPlayer[];
  totalPoints: number;
  activePlayers: number;
  totalPlayers: number;
}

interface UnmatchedPlayer {
  id: string;
  name: string;
  position: string;
  team: string | null;
  isRostered: boolean;
  isEliminated: boolean;
  ownerName: string | null;
  priority: number;
}

interface ESPNSearchResult {
  espnId: string;
  name: string;
  shortName: string;
  position: string | null;
  team: string | null;
  teamName: string | null;
}

// Health Dashboard Component
function HealthDashboard() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-[var(--chalk-muted)]">
          Loading health data...
        </CardContent>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-400">
          Failed to load health data
        </CardContent>
      </Card>
    );
  }

  const statusColors = {
    healthy: "bg-green-500",
    warning: "bg-yellow-500",
    error: "bg-red-500",
  };

  const statusLabels = {
    healthy: "Healthy",
    warning: "Warning",
    error: "Error",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            System Health
            <span className={`w-3 h-3 rounded-full ${statusColors[health.status]}`} />
            <span
              className={`text-sm font-normal ${
                health.status === "healthy"
                  ? "text-green-400"
                  : health.status === "warning"
                    ? "text-yellow-400"
                    : "text-red-400"
              }`}
            >
              {statusLabels[health.status]}
            </span>
          </CardTitle>
          {health.lastSync && (
            <span className="text-xs text-[var(--chalk-muted)]">
              Last sync:{" "}
              {health.lastSyncAge !== null
                ? `${health.lastSyncAge}m ago`
                : new Date(health.lastSync).toLocaleTimeString()}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerts */}
        {health.alerts.length > 0 && (
          <div className="space-y-2">
            {health.alerts.map((alert, i) => (
              <div
                key={i}
                className={`text-xs px-3 py-2 rounded ${
                  alert.type === "warning"
                    ? "bg-yellow-900/30 text-yellow-400"
                    : alert.type === "error"
                      ? "bg-red-900/30 text-red-400"
                      : "bg-blue-900/30 text-blue-400"
                }`}
              >
                {alert.type === "warning" && "⚠️ "}
                {alert.type === "error" && "❌ "}
                {alert.type === "info" && "ℹ️ "}
                {alert.message}
              </div>
            ))}
          </div>
        )}

        {/* Week Coverage */}
        <div>
          <div className="text-xs text-[var(--chalk-muted)] mb-2">Week Coverage</div>
          <div className="grid grid-cols-4 gap-2">
            {health.weekCoverage.map((week) => (
              <div
                key={week.week}
                className={`text-center p-2 rounded ${
                  week.hasData
                    ? "bg-green-900/30 border border-green-500/30"
                    : "bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)]"
                }`}
              >
                <div className="text-xs text-[var(--chalk-muted)]">{week.label}</div>
                <div
                  className={`text-lg font-bold ${week.hasData ? "text-green-400" : "text-[var(--chalk-muted)]"}`}
                >
                  {week.scoresCount}
                </div>
                <div className="text-[10px] text-[var(--chalk-muted)]">scores</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-[rgba(0,0,0,0.2)] rounded p-2">
            <div className="text-xl font-bold text-[var(--chalk-white)]">
              {health.stats.totalPlayers}
            </div>
            <div className="text-[10px] text-[var(--chalk-muted)]">Total Players</div>
          </div>
          <div className="bg-[rgba(0,0,0,0.2)] rounded p-2">
            <div className="text-xl font-bold text-green-400">{health.stats.playersWithEspnId}</div>
            <div className="text-[10px] text-[var(--chalk-muted)]">ESPN Matched</div>
          </div>
          <div className="bg-[rgba(0,0,0,0.2)] rounded p-2">
            <div className="text-xl font-bold text-[var(--chalk-white)]">
              {health.stats.activeTeams}
            </div>
            <div className="text-[10px] text-[var(--chalk-muted)]">Active Teams</div>
          </div>
          <div className="bg-[rgba(0,0,0,0.2)] rounded p-2">
            <div className="text-xl font-bold text-red-400">{health.stats.eliminatedTeams}</div>
            <div className="text-[10px] text-[var(--chalk-muted)]">Eliminated</div>
          </div>
        </div>

        {/* Eliminated Teams List */}
        {health.eliminatedTeamsList.length > 0 && (
          <div className="text-xs">
            <span className="text-[var(--chalk-muted)]">Eliminated: </span>
            <span className="text-red-400">{health.eliminatedTeamsList.join(", ")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Roster Management Component
function RosterManagement() {
  const [rosters, setRosters] = useState<RosterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);

  const fetchRosters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/rosters?year=${CURRENT_SEASON_YEAR}`);
      const data = await res.json();
      setRosters(data.rosters || []);
    } catch (error) {
      console.error("Error fetching rosters:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRosters();
  }, [fetchRosters]);

  const handleRemovePlayer = async (rosterId: string) => {
    if (!confirm("Remove this player from the roster?")) return;

    try {
      const res = await fetch("/api/admin/rosters", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rosterId }),
      });

      if (res.ok) {
        fetchRosters();
      }
    } catch (error) {
      console.error("Error removing player:", error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-[var(--chalk-muted)]">
          Loading rosters...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roster Management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rosters
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .map((roster) => (
            <div
              key={roster.ownerId}
              className="border border-[rgba(255,255,255,0.1)] rounded-lg overflow-hidden"
            >
              {/* Owner Header - Clickable */}
              <button
                onClick={() =>
                  setExpandedOwner(expandedOwner === roster.ownerId ? null : roster.ownerId)
                }
                className="w-full px-4 py-3 flex items-center justify-between bg-[rgba(0,0,0,0.2)] hover:bg-[rgba(0,0,0,0.3)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`transform transition-transform ${expandedOwner === roster.ownerId ? "rotate-90" : ""}`}
                  >
                    ▶
                  </span>
                  <span className="font-bold text-[var(--chalk-white)]">{roster.ownerName}</span>
                  <span className="text-xs text-[var(--chalk-muted)]">
                    {roster.activePlayers}/{roster.totalPlayers} active
                  </span>
                </div>
                <span className="font-bold text-[var(--chalk-green)]">
                  {roster.totalPoints.toFixed(1)} pts
                </span>
              </button>

              {/* Expanded Player List */}
              {expandedOwner === roster.ownerId && (
                <div className="border-t border-[rgba(255,255,255,0.1)]">
                  {roster.players.map((player) => (
                    <div
                      key={player.rosterId}
                      className={`px-4 py-2 flex items-center justify-between text-sm border-b border-[rgba(255,255,255,0.05)] last:border-0 ${
                        player.isEliminated ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[10px] text-[var(--chalk-muted)] w-8">
                          {player.rosterSlot}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            player.position === "QB"
                              ? "bg-red-900/50 text-red-400"
                              : player.position === "RB"
                                ? "bg-green-900/50 text-green-400"
                                : player.position === "WR"
                                  ? "bg-blue-900/50 text-blue-400"
                                  : player.position === "TE"
                                    ? "bg-yellow-900/50 text-yellow-400"
                                    : player.position === "K"
                                      ? "bg-purple-900/50 text-purple-400"
                                      : "bg-orange-900/50 text-orange-400"
                          }`}
                        >
                          {player.position}
                        </span>
                        <span
                          className={`${player.hasSubstitution ? "text-[var(--chalk-muted)] line-through" : "text-[var(--chalk-white)]"}`}
                        >
                          {player.name}
                        </span>
                        {player.team && (
                          <span className="text-xs text-[var(--chalk-muted)]">{player.team}</span>
                        )}
                        {!player.hasEspnId && (
                          <span className="text-[10px] bg-yellow-900/50 text-yellow-400 px-1 rounded">
                            No ESPN ID
                          </span>
                        )}
                        {player.hasSubstitution && (
                          <span className="text-[10px] bg-orange-900/50 text-orange-400 px-1 rounded">
                            INJ
                          </span>
                        )}
                        {player.isEliminated && !player.hasSubstitution && (
                          <span className="text-[10px] bg-red-900/50 text-red-400 px-1 rounded">
                            OUT
                          </span>
                        )}
                        {/* Show substitute player */}
                        {player.substitution && (
                          <span className="flex items-center gap-1 text-xs">
                            <span className="text-[var(--chalk-muted)]">/</span>
                            <span className="text-blue-400">
                              {player.substitution.substitutePlayer.name}
                            </span>
                            <span className="text-[10px] bg-blue-900/50 text-blue-400 px-1 rounded">
                              SUB
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Show points breakdown if there's a substitution */}
                        {player.substitution?.pointsBreakdown && (
                          <span className="text-[10px] text-[var(--chalk-muted)]">
                            ({player.substitution.pointsBreakdown.originalPoints.toFixed(1)} +{" "}
                            {player.substitution.pointsBreakdown.substitutePoints.toFixed(1)})
                          </span>
                        )}
                        <span
                          className={`font-mono ${player.totalPoints > 0 ? "text-[var(--chalk-green)]" : "text-[var(--chalk-muted)]"}`}
                        >
                          {player.totalPoints.toFixed(1)}
                        </span>
                        <button
                          onClick={() => handleRemovePlayer(player.rosterId)}
                          className="text-red-400 hover:text-red-300 text-xs"
                          title="Remove from roster"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

// Player Matching Tool Component
function PlayerMatchingTool() {
  const [unmatchedPlayers, setUnmatchedPlayers] = useState<UnmatchedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ESPNSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<UnmatchedPlayer | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetchUnmatched = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/players/unmatched?rostered=true");
      const data = await res.json();
      setUnmatchedPlayers(data.players || []);
    } catch (error) {
      console.error("Error fetching unmatched:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnmatched();
  }, [fetchUnmatched]);

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/admin/espn/search?name=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error("Error searching ESPN:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleAssignEspnId = async (playerId: string, espnId: string, team?: string | null) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ espnId, team: team || undefined }),
      });

      if (res.ok) {
        setSelectedPlayer(null);
        setSearchQuery("");
        setSearchResults([]);
        fetchUnmatched();
      }
    } catch (error) {
      console.error("Error updating player:", error);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-[var(--chalk-muted)]">
          Loading unmatched players...
        </CardContent>
      </Card>
    );
  }

  const activeUnmatched = unmatchedPlayers.filter((p) => !p.isEliminated);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Player Matching Tool</span>
          {activeUnmatched.length > 0 && (
            <span className="text-sm font-normal text-yellow-400">
              {activeUnmatched.length} on active teams
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {unmatchedPlayers.length === 0 ? (
          <div className="text-center text-green-400 py-4">
            ✓ All rostered players have ESPN IDs
          </div>
        ) : (
          <>
            {/* Unmatched Players List */}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {unmatchedPlayers.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${
                    selectedPlayer?.id === player.id
                      ? "bg-[var(--chalk-blue)]/20 border border-[var(--chalk-blue)]/50"
                      : "bg-[rgba(0,0,0,0.2)] hover:bg-[rgba(0,0,0,0.3)]"
                  } ${player.isEliminated ? "opacity-50" : ""}`}
                  onClick={() => {
                    setSelectedPlayer(player);
                    setSearchQuery(player.name);
                    handleSearch(player.name);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        player.priority === 1
                          ? "bg-yellow-900/50 text-yellow-400"
                          : "bg-[rgba(255,255,255,0.1)] text-[var(--chalk-muted)]"
                      }`}
                    >
                      {player.position}
                    </span>
                    <span className="text-[var(--chalk-white)]">{player.name}</span>
                    {player.team && (
                      <span className="text-xs text-[var(--chalk-muted)]">{player.team}</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--chalk-muted)]">{player.ownerName}</span>
                </div>
              ))}
            </div>

            {/* Search Section */}
            {selectedPlayer && (
              <div className="border-t border-[rgba(255,255,255,0.1)] pt-4 space-y-3">
                <div className="text-sm text-[var(--chalk-white)]">
                  Finding ESPN match for: <span className="font-bold">{selectedPlayer.name}</span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      handleSearch(e.target.value);
                    }}
                    placeholder="Search ESPN..."
                    className="flex-1 bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-2 text-sm text-[var(--chalk-white)] placeholder:text-[var(--chalk-muted)]"
                  />
                  <button
                    onClick={() => handleSearch(searchQuery)}
                    disabled={searching}
                    className="px-4 py-2 bg-[var(--chalk-blue)] hover:bg-[var(--chalk-blue)]/80 rounded text-sm font-medium disabled:opacity-50"
                  >
                    {searching ? "..." : "Search"}
                  </button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-1">
                    {searchResults.map((result) => (
                      <div
                        key={result.espnId}
                        className="flex items-center justify-between px-3 py-2 bg-[rgba(0,0,0,0.2)] rounded hover:bg-[rgba(0,0,0,0.3)]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--chalk-white)]">{result.name}</span>
                          {result.position && (
                            <span className="text-xs text-[var(--chalk-muted)]">
                              {result.position}
                            </span>
                          )}
                          {result.team && (
                            <span className="text-xs text-[var(--chalk-muted)]">{result.team}</span>
                          )}
                          <span className="text-[10px] text-[var(--chalk-muted)]">
                            ID: {result.espnId}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            handleAssignEspnId(selectedPlayer.id, result.espnId, result.team)
                          }
                          disabled={updating}
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-medium disabled:opacity-50"
                        >
                          {updating ? "..." : "Use"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {searchResults.length === 0 && searchQuery.length >= 2 && !searching && (
                  <div className="text-sm text-[var(--chalk-muted)] text-center py-2">
                    No ESPN results found
                  </div>
                )}

                {/* Manual Entry Option */}
                <div className="pt-2 border-t border-[rgba(255,255,255,0.1)]">
                  <ManualEspnIdEntry
                    playerId={selectedPlayer.id}
                    onSuccess={() => {
                      setSelectedPlayer(null);
                      fetchUnmatched();
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Manual ESPN ID Entry Component
function ManualEspnIdEntry({ playerId, onSuccess }: { playerId: string; onSuccess: () => void }) {
  const [espnId, setEspnId] = useState("");
  const [updating, setUpdating] = useState(false);

  const handleSubmit = async () => {
    if (!espnId.trim()) return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ espnId: espnId.trim() }),
      });

      if (res.ok) {
        setEspnId("");
        onSuccess();
      }
    } catch (error) {
      console.error("Error updating player:", error);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={espnId}
        onChange={(e) => setEspnId(e.target.value)}
        placeholder="Enter ESPN ID manually..."
        className="flex-1 bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-2 text-sm text-[var(--chalk-white)] placeholder:text-[var(--chalk-muted)]"
      />
      <button
        onClick={handleSubmit}
        disabled={updating || !espnId.trim()}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium disabled:opacity-50"
      >
        {updating ? "..." : "Set ID"}
      </button>
    </div>
  );
}

// Substitutions Management Component
interface SubstitutionData {
  id: string;
  rosterId: string;
  ownerName: string;
  rosterSlot: string;
  effectiveWeek: number;
  reason: string | null;
  originalPlayer: {
    id: string;
    name: string;
    position: string;
    team: string | null;
    pointsBefore: number;
  };
  substitutePlayer: {
    id: string;
    name: string;
    position: string;
    team: string | null;
    pointsAfter: number;
  };
  combinedPoints: number;
}

const WEEK_OPTIONS = [
  { value: 1, label: "Wild Card (Week 1)" },
  { value: 2, label: "Divisional (Week 2)" },
  { value: 3, label: "Conference Championship (Week 3)" },
  { value: 5, label: "Super Bowl (Week 5)" },
];

function SubstitutionsManagement() {
  const [substitutions, setSubstitutions] = useState<SubstitutionData[]>([]);
  const [rosters, setRosters] = useState<RosterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [selectedRosterId, setSelectedRosterId] = useState("");
  const [substitutePlayerName, setSubstitutePlayerName] = useState("");
  const [substitutePosition, setSubstitutePosition] = useState("");
  const [substituteTeam, setSubstituteTeam] = useState("");
  const [effectiveWeek, setEffectiveWeek] = useState(2);
  const [reason, setReason] = useState("");
  const [espnSearchResults, setEspnSearchResults] = useState<ESPNSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [subsRes, rostersRes] = await Promise.all([
        fetch(`/api/admin/substitutions?year=${CURRENT_SEASON_YEAR}`),
        fetch(`/api/admin/rosters?year=${CURRENT_SEASON_YEAR}`),
      ]);
      const subsData = await subsRes.json();
      const rostersData = await rostersRes.json();
      setSubstitutions(subsData.substitutions || []);
      setRosters(rostersData.rosters || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearchSubstitute = async (query: string) => {
    if (query.length < 2) {
      setEspnSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/espn/search?name=${encodeURIComponent(query)}`);
      const data = await res.json();
      setEspnSearchResults(data.results || []);
    } catch (error) {
      console.error("Error searching ESPN:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSubstitute = (result: ESPNSearchResult) => {
    setSubstitutePlayerName(result.name);
    setSubstitutePosition(result.position || "");
    setSubstituteTeam(result.team || "");
    setEspnSearchResults([]);
  };

  const handleCreate = async () => {
    if (!selectedRosterId || !substitutePlayerName || !substitutePosition || !effectiveWeek) {
      alert("Please fill in all required fields");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/substitutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rosterId: selectedRosterId,
          substitutePlayerName,
          substitutePosition,
          substituteTeam: substituteTeam || null,
          effectiveWeek,
          reason: reason || null,
          year: CURRENT_SEASON_YEAR,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        // Reset form
        setSelectedRosterId("");
        setSubstitutePlayerName("");
        setSubstitutePosition("");
        setSubstituteTeam("");
        setEffectiveWeek(2);
        setReason("");
        setShowForm(false);
        fetchData();
      } else {
        alert(data.error || "Failed to create substitution");
      }
    } catch (error) {
      console.error("Error creating substitution:", error);
      alert("Failed to create substitution");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (substitutionId: string) => {
    if (!confirm("Remove this substitution? The original player will be restored.")) return;

    try {
      const res = await fetch("/api/admin/substitutions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ substitutionId }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Error deleting substitution:", error);
    }
  };

  // Get the selected roster's player info
  const selectedRoster = rosters
    .flatMap((r) => r.players.map((p) => ({ ...p, ownerName: r.ownerName })))
    .find((p) => p.rosterId === selectedRosterId);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-[var(--chalk-muted)]">
          Loading substitutions...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Injured Player Substitutions</span>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1 bg-orange-600 hover:bg-orange-700 rounded text-sm font-medium"
          >
            {showForm ? "Cancel" : "+ Add Substitution"}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create Form */}
        {showForm && (
          <div className="border border-orange-500/30 bg-orange-900/10 rounded-lg p-4 space-y-4">
            <div className="text-sm font-bold text-orange-400">Create Substitution</div>

            {/* Select Injured Player */}
            <div>
              <label className="block text-xs text-[var(--chalk-muted)] mb-1">
                Injured Player (select roster slot)
              </label>
              <select
                value={selectedRosterId}
                onChange={(e) => {
                  setSelectedRosterId(e.target.value);
                  // Auto-set position from selected player
                  const player = rosters
                    .flatMap((r) => r.players)
                    .find((p) => p.rosterId === e.target.value);
                  if (player) {
                    setSubstitutePosition(player.position);
                  }
                }}
                className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-2 text-sm text-[var(--chalk-white)]"
              >
                <option value="">Select injured player...</option>
                {rosters.map((roster) => (
                  <optgroup key={roster.ownerId} label={roster.ownerName}>
                    {roster.players
                      .filter(
                        (p) => !(p as RosterPlayer & { hasSubstitution?: boolean }).hasSubstitution
                      )
                      .map((player) => (
                        <option key={player.rosterId} value={player.rosterId}>
                          {player.rosterSlot}: {player.name} ({player.position}) -{" "}
                          {player.totalPoints.toFixed(1)} pts
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {selectedRoster && (
              <div className="text-xs text-[var(--chalk-muted)] bg-[rgba(0,0,0,0.2)] p-2 rounded">
                Replacing: <span className="text-orange-400">{selectedRoster.name}</span> (
                {selectedRoster.position}) for{" "}
                <span className="text-[var(--chalk-white)]">{selectedRoster.ownerName}</span>
              </div>
            )}

            {/* Substitute Player */}
            <div>
              <label className="block text-xs text-[var(--chalk-muted)] mb-1">
                Substitute Player Name
              </label>
              <input
                type="text"
                value={substitutePlayerName}
                onChange={(e) => {
                  setSubstitutePlayerName(e.target.value);
                  handleSearchSubstitute(e.target.value);
                }}
                placeholder="Search for substitute player..."
                className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-2 text-sm text-[var(--chalk-white)] placeholder:text-[var(--chalk-muted)]"
              />
              {/* ESPN Search Results */}
              {espnSearchResults.length > 0 && (
                <div className="mt-1 border border-[rgba(255,255,255,0.1)] rounded max-h-32 overflow-y-auto">
                  {espnSearchResults.map((result) => (
                    <button
                      key={result.espnId}
                      onClick={() => handleSelectSubstitute(result)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[rgba(255,255,255,0.1)] flex items-center gap-2"
                    >
                      <span className="text-[var(--chalk-white)]">{result.name}</span>
                      {result.position && (
                        <span className="text-xs text-[var(--chalk-muted)]">{result.position}</span>
                      )}
                      {result.team && (
                        <span className="text-xs text-[var(--chalk-muted)]">{result.team}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Position and Team */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--chalk-muted)] mb-1">Position</label>
                <select
                  value={substitutePosition}
                  onChange={(e) => setSubstitutePosition(e.target.value)}
                  className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-2 text-sm text-[var(--chalk-white)]"
                >
                  <option value="">Select...</option>
                  <option value="QB">QB</option>
                  <option value="RB">RB</option>
                  <option value="WR">WR</option>
                  <option value="TE">TE</option>
                  <option value="K">K</option>
                  <option value="DST">DST</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--chalk-muted)] mb-1">
                  Team (optional)
                </label>
                <input
                  type="text"
                  value={substituteTeam}
                  onChange={(e) => setSubstituteTeam(e.target.value.toUpperCase())}
                  placeholder="e.g. KC"
                  className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-2 text-sm text-[var(--chalk-white)] placeholder:text-[var(--chalk-muted)]"
                />
              </div>
            </div>

            {/* Effective Week */}
            <div>
              <label className="block text-xs text-[var(--chalk-muted)] mb-1">
                Effective Week (substitute starts scoring)
              </label>
              <select
                value={effectiveWeek}
                onChange={(e) => setEffectiveWeek(parseInt(e.target.value))}
                className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-2 text-sm text-[var(--chalk-white)]"
              >
                {WEEK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[var(--chalk-muted)] mt-1">
                Original player scores for weeks before this. Substitute scores from this week
                onward.
              </p>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs text-[var(--chalk-muted)] mb-1">
                Reason (optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. ACL injury, Concussion"
                className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-2 text-sm text-[var(--chalk-white)] placeholder:text-[var(--chalk-muted)]"
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={
                creating || !selectedRosterId || !substitutePlayerName || !substitutePosition
              }
              className="w-full py-2 bg-orange-600 hover:bg-orange-700 rounded text-sm font-medium disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Substitution"}
            </button>
          </div>
        )}

        {/* Existing Substitutions */}
        {substitutions.length === 0 ? (
          <div className="text-center text-[var(--chalk-muted)] py-4">
            No substitutions yet. Add one when a player gets injured.
          </div>
        ) : (
          <div className="space-y-2">
            {substitutions.map((sub) => (
              <div
                key={sub.id}
                className="border border-[rgba(255,255,255,0.1)] rounded-lg p-3 bg-[rgba(0,0,0,0.2)]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--chalk-white)]">
                      {sub.ownerName}
                    </span>
                    <span className="text-xs text-[var(--chalk-muted)]">{sub.rosterSlot}</span>
                  </div>
                  <button
                    onClick={() => handleDelete(sub.id)}
                    className="text-red-400 hover:text-red-300 text-xs"
                    title="Remove substitution"
                  >
                    ✕ Remove
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-orange-400 line-through">{sub.originalPlayer.name}</span>
                  <span className="text-[8px] bg-orange-900/30 text-orange-400 px-1 rounded">
                    INJ
                  </span>
                  <span className="text-[var(--chalk-muted)]">→</span>
                  <span className="text-blue-400">{sub.substitutePlayer.name}</span>
                  <span className="text-[8px] bg-blue-900/30 text-blue-400 px-1 rounded">SUB</span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-[var(--chalk-muted)]">
                  <span>
                    From:{" "}
                    {WEEK_OPTIONS.find((w) => w.value === sub.effectiveWeek)?.label ||
                      `Week ${sub.effectiveWeek}`}
                  </span>
                  {sub.reason && <span>Reason: {sub.reason}</span>}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs">
                  <span className="text-orange-400">
                    {sub.originalPlayer.name}: {sub.originalPlayer.pointsBefore.toFixed(1)} pts
                  </span>
                  <span className="text-[var(--chalk-muted)]">+</span>
                  <span className="text-blue-400">
                    {sub.substitutePlayer.name}: {sub.substitutePlayer.pointsAfter.toFixed(1)} pts
                  </span>
                  <span className="text-[var(--chalk-muted)]">=</span>
                  <span className="text-[var(--chalk-green)] font-bold">
                    {sub.combinedPoints.toFixed(1)} total
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Players Overview Component - Comprehensive roster management
interface PlayerOverviewData {
  playerId: string;
  playerName: string;
  position: string;
  team: string | null;
  espnId: string | null;
  hasEspnId: boolean;
  ownerId: string;
  ownerName: string;
  rosterSlot: string;
  rosterId: string;
  isEliminated: boolean;
  isByeTeam: boolean;
  scores: {
    week: number;
    points: number | null;
    isBye: boolean;
  }[];
  totalPoints: number;
  // Substitution data
  hasSubstitution?: boolean;
  substitution?: {
    id: string;
    effectiveWeek: number;
    reason: string | null;
    isActive: boolean;
    substitutePlayer: {
      id: string;
      name: string;
      position: string;
      team: string | null;
      espnId: string | null;
    };
  } | null;
}

interface OverviewResponse {
  players: PlayerOverviewData[];
  summary: {
    total: number;
    withEspnId: number;
    withoutEspnId: number;
    onActiveTeams: number;
    onEliminatedTeams: number;
  };
  scoreCoverage: {
    week: number;
    label: string;
    playersWithScores: number;
    playersExpected: number;
    byeCount: number;
    coverage: number;
  }[];
  teams: string[];
  eliminatedTeams: string[];
  byeTeams: string[];
}

function PlayersOverview() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [matchedFilter, setMatchedFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [espnSearchResults, setEspnSearchResults] = useState<ESPNSearchResult[]>([]);
  const [espnSearching, setEspnSearching] = useState(false);
  const [updating, setUpdating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (teamFilter) params.set("team", teamFilter);
      if (matchedFilter) params.set("matched", matchedFilter);

      const res = await fetch(`/api/admin/players/overview?${params}`);
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Error fetching players overview:", error);
    } finally {
      setLoading(false);
    }
  }, [teamFilter, matchedFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEspnSearch = async (query: string) => {
    if (query.length < 2) {
      setEspnSearchResults([]);
      return;
    }
    setEspnSearching(true);
    try {
      const res = await fetch(`/api/admin/espn/search?name=${encodeURIComponent(query)}`);
      const data = await res.json();
      setEspnSearchResults(data.results || []);
    } catch (error) {
      console.error("Error searching ESPN:", error);
    } finally {
      setEspnSearching(false);
    }
  };

  const handleAssignEspnId = async (playerId: string, espnId: string, team?: string | null) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ espnId, team: team || undefined }),
      });

      if (res.ok) {
        setExpandedPlayer(null);
        setEspnSearchResults([]);
        fetchData();
      } else {
        const errorData = await res.json();
        alert(errorData.message || errorData.error || "Failed to assign ESPN ID");
      }
    } catch (error) {
      console.error("Error updating player:", error);
    } finally {
      setUpdating(false);
    }
  };

  if (loading && !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-[var(--chalk-muted)]">
          Loading players overview...
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-red-400">
          Failed to load players overview
        </CardContent>
      </Card>
    );
  }

  // Filter by search query
  let filteredPlayers = data.players;
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredPlayers = filteredPlayers.filter(
      (p) =>
        p.playerName.toLowerCase().includes(query) ||
        p.ownerName.toLowerCase().includes(query) ||
        p.team?.toLowerCase().includes(query)
    );
  }

  const weekLabels = ["WC", "DIV", "CC", "SB"];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>Players Overview</span>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1 bg-[var(--chalk-blue)] hover:bg-[var(--chalk-blue)]/80 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? "..." : "Refresh"}
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
          <div className="bg-[rgba(0,0,0,0.2)] rounded p-2">
            <div className="text-lg font-bold text-[var(--chalk-white)]">{data.summary.total}</div>
            <div className="text-[var(--chalk-muted)]">Total</div>
          </div>
          <div className="bg-[rgba(0,0,0,0.2)] rounded p-2">
            <div className="text-lg font-bold text-green-400">{data.summary.withEspnId}</div>
            <div className="text-[var(--chalk-muted)]">ESPN ID</div>
          </div>
          <div className="bg-[rgba(0,0,0,0.2)] rounded p-2">
            <div className="text-lg font-bold text-red-400">{data.summary.withoutEspnId}</div>
            <div className="text-[var(--chalk-muted)]">No ESPN ID</div>
          </div>
          <div className="bg-[rgba(0,0,0,0.2)] rounded p-2">
            <div className="text-lg font-bold text-[var(--chalk-white)]">
              {data.summary.onActiveTeams}
            </div>
            <div className="text-[var(--chalk-muted)]">Active</div>
          </div>
          <div className="bg-[rgba(0,0,0,0.2)] rounded p-2">
            <div className="text-lg font-bold text-[var(--chalk-muted)]">
              {data.summary.onEliminatedTeams}
            </div>
            <div className="text-[var(--chalk-muted)]">Eliminated</div>
          </div>
        </div>

        {/* Score Coverage */}
        <div className="grid grid-cols-4 gap-2">
          {data.scoreCoverage.map((cov) => (
            <div
              key={cov.week}
              className={`text-center p-2 rounded text-xs ${
                cov.coverage >= 90
                  ? "bg-green-900/30 border border-green-500/30"
                  : cov.coverage >= 50
                    ? "bg-yellow-900/30 border border-yellow-500/30"
                    : "bg-red-900/30 border border-red-500/30"
              }`}
            >
              <div className="font-bold">{cov.label}</div>
              <div className="text-[var(--chalk-muted)]">
                {cov.playersWithScores}/{cov.playersExpected} ({cov.coverage}%)
              </div>
              {cov.byeCount > 0 && (
                <div className="text-[10px] text-blue-400">{cov.byeCount} bye</div>
              )}
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-1.5 text-sm text-[var(--chalk-white)]"
          >
            <option value="">All Teams</option>
            {data.teams.map((team) => (
              <option key={team} value={team}>
                {team} {data.byeTeams.includes(team) ? "(BYE)" : ""}{" "}
                {data.eliminatedTeams.includes(team) ? "(OUT)" : ""}
              </option>
            ))}
          </select>

          <select
            value={matchedFilter}
            onChange={(e) => setMatchedFilter(e.target.value)}
            className="bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-1.5 text-sm text-[var(--chalk-white)]"
          >
            <option value="">All Status</option>
            <option value="true">Has ESPN ID</option>
            <option value="false">No ESPN ID</option>
          </select>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search players..."
            className="flex-1 min-w-[150px] bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-1.5 text-sm text-[var(--chalk-white)] placeholder:text-[var(--chalk-muted)]"
          />
        </div>

        {/* Players Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--chalk-muted)] border-b border-[rgba(255,255,255,0.1)]">
                <th className="pb-2 pr-2">Owner</th>
                <th className="pb-2 pr-2">Slot</th>
                <th className="pb-2 pr-2">Player</th>
                <th className="pb-2 pr-2">Pos</th>
                <th className="pb-2 pr-2">Team</th>
                <th className="pb-2 pr-2">ESPN</th>
                {weekLabels.map((label) => (
                  <th key={label} className="pb-2 pr-2 text-center w-12">
                    {label}
                  </th>
                ))}
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((player) => (
                <Fragment key={player.rosterId}>
                  <tr
                    className={`border-b border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.05)] cursor-pointer ${
                      player.isEliminated ? "opacity-50" : ""
                    } ${!player.hasEspnId ? "bg-red-900/10" : ""}`}
                    onClick={() =>
                      setExpandedPlayer(expandedPlayer === player.playerId ? null : player.playerId)
                    }
                  >
                    <td className="py-1.5 pr-2 text-[var(--chalk-muted)]">{player.ownerName}</td>
                    <td className="py-1.5 pr-2 text-[10px] text-[var(--chalk-muted)]">
                      {player.rosterSlot}
                    </td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={
                            player.hasSubstitution
                              ? "text-[var(--chalk-muted)] line-through"
                              : "text-[var(--chalk-white)]"
                          }
                        >
                          {player.playerName}
                        </span>
                        {player.hasSubstitution && (
                          <span className="text-[10px] bg-orange-900/50 text-orange-400 px-1 rounded">
                            INJ
                          </span>
                        )}
                        {player.substitution && (
                          <>
                            <span className="text-[var(--chalk-muted)]">/</span>
                            <span className="text-blue-400">
                              {player.substitution.substitutePlayer.name}
                            </span>
                            <span className="text-[10px] bg-blue-900/50 text-blue-400 px-1 rounded">
                              SUB
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2">
                      <span
                        className={`text-[10px] px-1 py-0.5 rounded ${
                          player.position === "QB"
                            ? "bg-red-900/50 text-red-400"
                            : player.position === "RB"
                              ? "bg-green-900/50 text-green-400"
                              : player.position === "WR"
                                ? "bg-blue-900/50 text-blue-400"
                                : player.position === "TE"
                                  ? "bg-yellow-900/50 text-yellow-400"
                                  : player.position === "K"
                                    ? "bg-purple-900/50 text-purple-400"
                                    : "bg-orange-900/50 text-orange-400"
                        }`}
                      >
                        {player.position}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-xs text-[var(--chalk-muted)]">
                      {player.team || "-"}
                      {player.isByeTeam && <span className="ml-1 text-blue-400">(bye)</span>}
                    </td>
                    <td className="py-1.5 pr-2">
                      {player.hasEspnId ? (
                        <span className="text-green-400 text-[10px]" title={player.espnId || ""}>
                          OK
                        </span>
                      ) : (
                        <span className="text-red-400 text-[10px]">NONE</span>
                      )}
                    </td>
                    {player.scores.map((score, idx) => (
                      <td key={idx} className="py-1.5 pr-2 text-center text-xs">
                        {score.isBye ? (
                          <span className="text-blue-400">BYE</span>
                        ) : score.points !== null ? (
                          <span
                            className={
                              score.points > 0
                                ? "text-[var(--chalk-green)]"
                                : "text-[var(--chalk-muted)]"
                            }
                          >
                            {score.points.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-[var(--chalk-muted)]">--</span>
                        )}
                      </td>
                    ))}
                    <td className="py-1.5 text-right font-mono text-[var(--chalk-green)]">
                      {player.totalPoints.toFixed(1)}
                    </td>
                  </tr>

                  {/* Expanded Row for ESPN Search */}
                  {expandedPlayer === player.playerId && (
                    <tr>
                      <td colSpan={11} className="py-3 px-4 bg-[rgba(0,0,0,0.3)]">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-[var(--chalk-muted)]">Set ESPN ID for:</span>
                            <span className="font-bold text-[var(--chalk-white)]">
                              {player.playerName}
                            </span>
                            {player.espnId && (
                              <span className="text-xs text-green-400">
                                Current: {player.espnId}
                              </span>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <input
                              type="text"
                              defaultValue={player.playerName}
                              placeholder="Search ESPN..."
                              className="flex-1 bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-2 text-sm text-[var(--chalk-white)]"
                              onChange={(e) => handleEspnSearch(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEspnSearch(player.playerName);
                              }}
                              disabled={espnSearching}
                              className="px-4 py-2 bg-[var(--chalk-blue)] hover:bg-[var(--chalk-blue)]/80 rounded text-sm disabled:opacity-50"
                            >
                              {espnSearching ? "..." : "Search"}
                            </button>
                          </div>

                          {espnSearchResults.length > 0 && (
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {espnSearchResults.map((result) => (
                                <div
                                  key={result.espnId}
                                  className="flex items-center justify-between px-3 py-2 bg-[rgba(0,0,0,0.2)] rounded hover:bg-[rgba(0,0,0,0.3)]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-[var(--chalk-white)]">{result.name}</span>
                                    {result.position && (
                                      <span className="text-xs text-[var(--chalk-muted)]">
                                        {result.position}
                                      </span>
                                    )}
                                    {result.team && (
                                      <span className="text-xs text-[var(--chalk-muted)]">
                                        {result.team}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-[var(--chalk-muted)]">
                                      ID: {result.espnId}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() =>
                                      handleAssignEspnId(
                                        player.playerId,
                                        result.espnId,
                                        result.team
                                      )
                                    }
                                    disabled={updating}
                                    className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-medium disabled:opacity-50"
                                  >
                                    {updating ? "..." : "Use"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Manual Entry */}
                          <div className="flex gap-2 pt-2 border-t border-[rgba(255,255,255,0.1)]">
                            <input
                              type="text"
                              placeholder="Enter ESPN ID manually..."
                              className="flex-1 bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.2)] rounded px-3 py-2 text-sm text-[var(--chalk-white)]"
                              id={`manual-${player.playerId}`}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const input = document.getElementById(
                                  `manual-${player.playerId}`
                                ) as HTMLInputElement;
                                if (input?.value.trim()) {
                                  handleAssignEspnId(player.playerId, input.value.trim());
                                }
                              }}
                              disabled={updating}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm disabled:opacity-50"
                            >
                              Set ID
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {filteredPlayers.length === 0 && (
          <div className="text-center text-[var(--chalk-muted)] py-4">
            No players match the current filters
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Sync Actions Component (moved from old admin)
function SyncActions() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: CURRENT_SEASON_YEAR,
          weeks: [1, 2, 3, 5],
        }),
      });

      const data = await response.json();
      if (data.success) {
        setResult(
          `Synced ${data.data?.scoresUpdated || 0} scores from ${data.data?.gamesFound || 0} games`
        );
      } else {
        setResult(`Error: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : "Unknown"}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual Sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[var(--chalk-muted)]">
          Manually trigger ESPN data sync. This runs automatically via cron every 15 minutes.
        </p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="w-full chalk-button chalk-button-blue"
        >
          {syncing ? "Syncing..." : "Sync ESPN Data"}
        </button>
        {result && (
          <div
            className={`text-sm p-2 rounded ${
              result.startsWith("Error")
                ? "bg-red-900/30 text-red-400"
                : "bg-green-900/30 text-green-400"
            }`}
          >
            {result}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Main Admin Page
export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-[var(--chalk-yellow)] chalk-text">Admin Dashboard</h1>

      {/* Health Dashboard */}
      <HealthDashboard />

      {/* Players Overview - Comprehensive view with scores and ESPN IDs */}
      <PlayersOverview />

      {/* Substitutions Management - Full Width */}
      <SubstitutionsManagement />

      {/* Two Column Layout for smaller cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Player Matching Tool (legacy - for quick unmatched player access) */}
        <PlayerMatchingTool />

        {/* Sync Actions */}
        <SyncActions />
      </div>

      {/* Roster Management - Full Width */}
      <RosterManagement />
    </div>
  );
}
