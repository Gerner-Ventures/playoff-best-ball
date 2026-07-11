"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CURRENT_SEASON_YEAR } from "@/lib/constants";

interface TeamOdd {
  id: string;
  team: string;
  opponent: string;
  winProb: number;
  moneyline: number | null;
  week: number;
}

interface PlayerProjection {
  id: string;
  playerId: string;
  playerName: string;
  team: string | null;
  position: string;
  projectedPoints: number;
  expectedValue: number | null;
  source: string;
}

const NFL_TEAMS = [
  "ARI",
  "ATL",
  "BAL",
  "BUF",
  "CAR",
  "CHI",
  "CIN",
  "CLE",
  "DAL",
  "DEN",
  "DET",
  "GB",
  "HOU",
  "IND",
  "JAX",
  "KC",
  "LV",
  "LAC",
  "LAR",
  "MIA",
  "MIN",
  "NE",
  "NO",
  "NYG",
  "NYJ",
  "PHI",
  "PIT",
  "SF",
  "SEA",
  "TB",
  "TEN",
  "WAS",
];

export default function AdminProjectionsPage() {
  const [selectedWeek, setSelectedWeek] = useState(2);
  const [odds, setOdds] = useState<TeamOdd[]>([]);
  const [projections, setProjections] = useState<PlayerProjection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // New matchup form
  const [newMatchup, setNewMatchup] = useState({
    homeTeam: "",
    awayTeam: "",
    homeWinProb: 50,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [oddsRes, projRes] = await Promise.all([
        fetch(`/api/odds?year=${CURRENT_SEASON_YEAR}&week=${selectedWeek}`),
        fetch(`/api/projections?year=${CURRENT_SEASON_YEAR}&week=${selectedWeek}`),
      ]);

      if (oddsRes.ok) {
        const data = await oddsRes.json();
        setOdds(data.odds || []);
      }

      if (projRes.ok) {
        const data = await projRes.json();
        // Flatten player projections from all owners
        const allPlayers: PlayerProjection[] = [];
        for (const owner of data.projections || []) {
          for (const player of owner.players || []) {
            allPlayers.push({
              id: player.id,
              playerId: player.id,
              playerName: player.name,
              team: player.team,
              position: player.position,
              projectedPoints: player.projectedPoints,
              expectedValue: player.expectedValue,
              source: player.source || "calculated",
            });
          }
        }
        setProjections(allPlayers);
      }
    } catch {
      console.error("Error fetching data");
    } finally {
      setLoading(false);
    }
  }, [selectedWeek]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSyncOdds = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/odds?year=${CURRENT_SEASON_YEAR}&week=${selectedWeek}`, {
        method: "POST",
      });
      const data = await response.json();
      if (response.ok) {
        setMessage(`Synced ${data.synced} team odds from ${data.games} games`);
        await fetchData();
      } else {
        setMessage(data.message || "Failed to sync odds");
      }
    } catch {
      setMessage("Error syncing odds");
    } finally {
      setSaving(false);
    }
  };

  const handleSyncProjections = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/projections/sync?year=${CURRENT_SEASON_YEAR}&week=${selectedWeek}`,
        { method: "POST" }
      );
      const data = await response.json();
      if (response.ok) {
        setMessage(`Synced ${data.synced} projections (skipped ${data.skipped})`);
        await fetchData();
      } else {
        setMessage(data.message || "Failed to sync projections");
      }
    } catch {
      setMessage("Error syncing projections");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMatchup = async () => {
    if (!newMatchup.homeTeam || !newMatchup.awayTeam) {
      setMessage("Please select both teams");
      return;
    }

    setSaving(true);
    setMessage(null);

    const homeWinProb = newMatchup.homeWinProb / 100;
    const awayWinProb = 1 - homeWinProb;

    try {
      // Add home team odds
      await fetch("/api/odds/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: newMatchup.homeTeam,
          opponent: newMatchup.awayTeam,
          winProb: homeWinProb,
          week: selectedWeek,
          year: CURRENT_SEASON_YEAR,
        }),
      });

      // Add away team odds
      await fetch("/api/odds/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: newMatchup.awayTeam,
          opponent: newMatchup.homeTeam,
          winProb: awayWinProb,
          week: selectedWeek,
          year: CURRENT_SEASON_YEAR,
        }),
      });

      setMessage("Matchup added successfully");
      setNewMatchup({ homeTeam: "", awayTeam: "", homeWinProb: 50 });
      await fetchData();
    } catch {
      setMessage("Error adding matchup");
    } finally {
      setSaving(false);
    }
  };

  const weekLabels: Record<number, string> = {
    1: "Wild Card",
    2: "Divisional",
    3: "Conference",
    5: "Super Bowl",
  };

  // Group odds by matchup
  const matchups = odds.reduce(
    (acc, odd) => {
      const key = [odd.team, odd.opponent].sort().join("-");
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(odd);
      return acc;
    },
    {} as Record<string, TeamOdd[]>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--chalk-yellow)] chalk-text">
            Projections Admin
          </h1>
          <p className="text-sm text-[var(--chalk-muted)]">
            Manage team odds and player projections
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(Number(e.target.value))}
            className="bg-[var(--chalk-surface)] border border-[var(--chalk-border)] rounded px-3 py-1.5 text-sm text-[var(--chalk-text)]"
          >
            {[1, 2, 3, 5].map((week) => (
              <option key={week} value={week}>
                Week {week}: {weekLabels[week]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded ${
            message.includes("Error") || message.includes("Failed")
              ? "bg-red-900/30 text-red-400"
              : "bg-green-900/30 text-green-400"
          }`}
        >
          {message}
        </div>
      )}

      {/* Sync Actions */}
      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-lg font-semibold text-[var(--chalk-text)]">Sync Data</h2>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <button
              onClick={handleSyncOdds}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded transition-colors"
            >
              {saving ? "..." : "Sync Odds from API"}
            </button>
            <button
              onClick={handleSyncProjections}
              disabled={saving}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-800 rounded transition-colors"
            >
              {saving ? "..." : "Recalculate Projections"}
            </button>
          </div>
          <p className="text-xs text-[var(--chalk-muted)] mt-2">
            Sync odds from The Odds API (requires THE_ODDS_API_KEY env var), then recalculate
            projections.
          </p>
        </CardContent>
      </Card>

      {/* Manual Matchup Entry */}
      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-lg font-semibold text-[var(--chalk-text)]">Add Manual Matchup</h2>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs text-[var(--chalk-muted)] block mb-1">Home Team</label>
              <select
                value={newMatchup.homeTeam}
                onChange={(e) => setNewMatchup({ ...newMatchup, homeTeam: e.target.value })}
                className="bg-[var(--chalk-surface)] border border-[var(--chalk-border)] rounded px-3 py-1.5 text-sm text-[var(--chalk-text)]"
              >
                <option value="">Select...</option>
                {NFL_TEAMS.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--chalk-muted)] block mb-1">Away Team</label>
              <select
                value={newMatchup.awayTeam}
                onChange={(e) => setNewMatchup({ ...newMatchup, awayTeam: e.target.value })}
                className="bg-[var(--chalk-surface)] border border-[var(--chalk-border)] rounded px-3 py-1.5 text-sm text-[var(--chalk-text)]"
              >
                <option value="">Select...</option>
                {NFL_TEAMS.filter((t) => t !== newMatchup.homeTeam).map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--chalk-muted)] block mb-1">
                Home Win %: {newMatchup.homeWinProb}%
              </label>
              <input
                type="range"
                min="1"
                max="99"
                value={newMatchup.homeWinProb}
                onChange={(e) =>
                  setNewMatchup({ ...newMatchup, homeWinProb: Number(e.target.value) })
                }
                className="w-32"
              />
            </div>
            <button
              onClick={handleAddMatchup}
              disabled={saving || !newMatchup.homeTeam || !newMatchup.awayTeam}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 rounded transition-colors"
            >
              Add Matchup
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Current Matchups */}
      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-lg font-semibold text-[var(--chalk-text)]">
            {weekLabels[selectedWeek]} Matchups
          </h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-[var(--chalk-muted)]">Loading...</div>
          ) : Object.keys(matchups).length === 0 ? (
            <div className="text-[var(--chalk-muted)]">
              No matchups set for this week. Add manually or sync from API.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.values(matchups).map((teams) => {
                const team1 = teams[0];
                const team2 = teams.find((t) => t.team !== team1.team);
                if (!team2) return null;

                return (
                  <div
                    key={`${team1.team}-${team2.team}`}
                    className="bg-[var(--chalk-surface)] rounded-lg p-4"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-[var(--chalk-text)]">{team1.team}</span>
                      <span className="text-[var(--chalk-green)]">
                        {(team1.winProb * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-[var(--chalk-green)]"
                        style={{ width: `${team1.winProb * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[var(--chalk-text)]">{team2.team}</span>
                      <span className="text-[var(--chalk-blue)]">
                        {(team2.winProb * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Player Projections */}
      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-lg font-semibold text-[var(--chalk-text)]">
            Player Projections ({projections.length})
          </h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-[var(--chalk-muted)]">Loading...</div>
          ) : projections.length === 0 ? (
            <div className="text-[var(--chalk-muted)]">
              No projections calculated. Click &quot;Recalculate Projections&quot; above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--chalk-border)]">
                    <th className="text-left py-2 px-2 text-[var(--chalk-muted)]">Player</th>
                    <th className="text-left py-2 px-2 text-[var(--chalk-muted)]">Team</th>
                    <th className="text-left py-2 px-2 text-[var(--chalk-muted)]">Pos</th>
                    <th className="text-right py-2 px-2 text-[var(--chalk-muted)]">Projected</th>
                    <th className="text-right py-2 px-2 text-[var(--chalk-muted)]">EV</th>
                    <th className="text-left py-2 px-2 text-[var(--chalk-muted)]">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {projections
                    .sort((a, b) => (b.expectedValue || 0) - (a.expectedValue || 0))
                    .slice(0, 50)
                    .map((player) => (
                      <tr
                        key={player.id}
                        className="border-b border-[var(--chalk-border)]/50 hover:bg-[var(--chalk-surface)]"
                      >
                        <td className="py-2 px-2 text-[var(--chalk-text)]">{player.playerName}</td>
                        <td className="py-2 px-2 text-[var(--chalk-muted)]">
                          {player.team || "-"}
                        </td>
                        <td className="py-2 px-2 text-[var(--chalk-muted)]">{player.position}</td>
                        <td className="py-2 px-2 text-right text-[var(--chalk-blue)]">
                          {player.projectedPoints.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 text-right text-[var(--chalk-green)]">
                          {player.expectedValue?.toFixed(1) || "-"}
                        </td>
                        <td className="py-2 px-2 text-xs text-[var(--chalk-muted)]">
                          {player.source}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {projections.length > 50 && (
                <div className="text-xs text-[var(--chalk-muted)] mt-2 text-center">
                  Showing top 50 by EV. Total: {projections.length} players.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
