"use client";

import { Card, CardContent, CardHeader } from "./ui/card";
import { PlayerRow } from "./player-row";

interface SubstitutionData {
  effectiveWeek: number;
  reason?: string | null;
  substitutePlayer: {
    id: string;
    name: string;
    team?: string | null;
  };
}

interface RosterPlayer {
  slot: string;
  name: string;
  points: number;
  playerId?: string;
  team?: string | null;
  // The team to check for elimination (substitute's team if substitution is active)
  activeTeam?: string | null;
  weeklyPoints?: { week: number; points: number }[];
  // Substitution data
  hasSubstitution?: boolean;
  substitution?: SubstitutionData | null;
}

interface RosterCardProps {
  ownerName: string;
  roster: RosterPlayer[];
  totalPoints: number;
  rank?: number;
  compact?: boolean;
  eliminatedTeams?: string[];
  activePlayers?: number;
  unknownPlayers?: number;
}

const rankColors = [
  "chalk-rank-1", // 1st
  "chalk-rank-2", // 2nd
  "chalk-rank-3", // 3rd
];

export function RosterCard({
  ownerName,
  roster,
  totalPoints,
  rank,
  compact = false,
  eliminatedTeams = [],
  activePlayers,
  unknownPlayers = 0,
}: RosterCardProps) {
  const slotOrder = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX", "K", "DST"];
  const sortedRoster = [...roster].sort(
    (a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot)
  );

  const rankClass = rank && rank <= 3 ? rankColors[rank - 1] : "";

  return (
    <Card className="h-full">
      <CardHeader className={compact ? "pb-2" : ""}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {rank && <span className={`chalk-rank ${rankClass}`}>{rank}</span>}
            <div>
              <h3
                className={`font-bold text-[var(--chalk-yellow)] chalk-text ${compact ? "text-lg" : "text-xl"}`}
              >
                {ownerName}
              </h3>
              {activePlayers !== undefined && (
                <div className="text-xs text-[var(--chalk-muted)]">
                  {activePlayers}/9 active
                  {unknownPlayers > 0 && (
                    <span className="text-yellow-400 ml-1">({unknownPlayers}?)</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <span className="text-2xl font-bold text-[var(--chalk-green)] chalk-score">
            {totalPoints.toFixed(1)}
          </span>
        </div>
      </CardHeader>
      <CardContent className={compact ? "pt-0" : ""}>
        <div className="space-y-0.5">
          {sortedRoster.map((player) => {
            // Use activeTeam (substitute's team if substitution active) for elimination check
            const teamToCheck = player.activeTeam ?? player.team;
            const hasTeam = teamToCheck != null && teamToCheck !== "";
            const isEliminated = hasTeam
              ? eliminatedTeams.includes(teamToCheck!.toUpperCase())
              : false;
            return (
              <PlayerRow
                key={player.slot}
                slot={player.slot}
                name={player.name}
                points={player.points}
                playerId={player.playerId}
                compact={compact}
                isEliminated={isEliminated}
                teamUnknown={!hasTeam}
                hasSubstitution={player.hasSubstitution}
                substitution={player.substitution}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
