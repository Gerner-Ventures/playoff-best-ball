"use client";

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface LeaderboardEntry {
  rank: number;
  name: string;
  totalPoints: number;
  weeklyPoints?: { week: number; points: number }[];
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  title?: string;
  showWeeklyBreakdown?: boolean;
}

const rankColors = ["chalk-rank-1", "chalk-rank-2", "chalk-rank-3"];
const weekLabels: Record<number, string> = { 1: "WC", 2: "DIV", 3: "CONF", 5: "SB" };

export function Leaderboard({
  entries,
  title = "Leaderboard",
  showWeeklyBreakdown = false,
}: LeaderboardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Mobile card view */}
        <div className="md:hidden space-y-3">
          {entries.map((entry, index) => (
            <div
              key={entry.name}
              className={`p-3 rounded-lg ${
                index === 0
                  ? "bg-yellow-900/30 border border-yellow-500/30"
                  : "bg-[rgba(0,0,0,0.2)] border border-[var(--chalk-muted)]/20"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={`chalk-rank ${index < 3 ? rankColors[index] : ""}`}>
                    {entry.rank}
                  </span>
                  <span className="font-medium text-[var(--chalk-white)]">{entry.name}</span>
                </div>
                <span className="text-xl font-bold text-[var(--chalk-green)] chalk-score">
                  {entry.totalPoints.toFixed(1)}
                </span>
              </div>
              {showWeeklyBreakdown && entry.weeklyPoints && (
                <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-dashed border-[var(--chalk-muted)]/30">
                  {[1, 2, 3, 5].map((week) => {
                    const weekData = entry.weeklyPoints?.find((w) => w.week === week);
                    return (
                      <div key={week} className="text-center">
                        <div className="text-xs text-[var(--chalk-yellow)]">{weekLabels[week]}</div>
                        <div className="text-sm text-[var(--chalk-muted)]">
                          {weekData?.points.toFixed(1) ?? "-"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop table view */}
        <div className="hidden md:block overflow-x-auto">
          <table className="chalk-table">
            <thead>
              <tr>
                <th className="w-16">Rank</th>
                <th>Owner</th>
                {showWeeklyBreakdown && (
                  <>
                    <th className="text-center">WC</th>
                    <th className="text-center">DIV</th>
                    <th className="text-center">CONF</th>
                    <th className="text-center">SB</th>
                  </>
                )}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={entry.name}>
                  <td>
                    <span className={`chalk-rank ${index < 3 ? rankColors[index] : ""}`}>
                      {entry.rank}
                    </span>
                  </td>
                  <td className="font-medium text-[var(--chalk-white)]">{entry.name}</td>
                  {showWeeklyBreakdown && entry.weeklyPoints && (
                    <>
                      {[1, 2, 3, 5].map((week) => {
                        const weekData = entry.weeklyPoints?.find((w) => w.week === week);
                        return (
                          <td key={week} className="text-center text-sm text-[var(--chalk-muted)]">
                            {weekData?.points.toFixed(1) ?? "-"}
                          </td>
                        );
                      })}
                    </>
                  )}
                  <td className="text-right">
                    <span className="text-xl font-bold text-[var(--chalk-green)] chalk-score">
                      {entry.totalPoints.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
