import { Position, RosterSlot, PlayerWithScore } from "@/types";

interface RosterPlayer {
  slot: RosterSlot;
  player: PlayerWithScore;
}

interface BestBallLineup {
  starters: RosterPlayer[];
  bench: RosterPlayer[];
  totalPoints: number;
}

/**
 * Positions eligible for the FLEX slot
 */
const FLEX_ELIGIBLE: Position[] = ["RB", "WR", "TE"];

/**
 * Required starters by slot
 */
const REQUIRED_STARTERS: { slot: RosterSlot; position: Position | null; count: number }[] = [
  { slot: "QB", position: "QB", count: 1 },
  { slot: "RB1", position: "RB", count: 1 },
  { slot: "RB2", position: "RB", count: 1 },
  { slot: "WR1", position: "WR", count: 1 },
  { slot: "WR2", position: "WR", count: 1 },
  { slot: "TE", position: "TE", count: 1 },
  { slot: "FLEX", position: null, count: 1 }, // RB/WR/TE
  { slot: "K", position: "K", count: 1 },
  { slot: "DST", position: "DST", count: 1 },
];

/**
 * Calculate the optimal best-ball lineup for a given week
 * Returns the lineup that maximizes points while respecting position requirements
 */
export function calculateBestBallLineup(
  roster: RosterPlayer[],
  weekNumber: number
): BestBallLineup {
  // Get points for each player for the specific week
  const playersWithWeekPoints = roster.map((rp) => ({
    ...rp,
    weekPoints: rp.player.weeklyScores.find((ws) => ws.week === weekNumber)?.points ?? 0,
  }));

  // Group players by position
  const byPosition = new Map<Position, typeof playersWithWeekPoints>();
  for (const player of playersWithWeekPoints) {
    const pos = player.player.position;
    if (!byPosition.has(pos)) {
      byPosition.set(pos, []);
    }
    byPosition.get(pos)!.push(player);
  }

  // Sort each position group by week points (descending)
  for (const players of byPosition.values()) {
    players.sort((a, b) => b.weekPoints - a.weekPoints);
  }

  const starters: ((typeof playersWithWeekPoints)[0] & { assignedSlot: RosterSlot })[] = [];
  const usedPlayerIds = new Set<string>();

  // Fill required slots (except FLEX)
  for (const req of REQUIRED_STARTERS) {
    if (req.slot === "FLEX") continue;

    const positionPlayers = byPosition.get(req.position!) ?? [];
    const available = positionPlayers.filter((p) => !usedPlayerIds.has(p.player.id));

    if (available.length > 0) {
      const best = available[0];
      starters.push({ ...best, assignedSlot: req.slot });
      usedPlayerIds.add(best.player.id);
    }
  }

  // Fill FLEX with best remaining RB/WR/TE
  const flexCandidates: typeof playersWithWeekPoints = [];
  for (const pos of FLEX_ELIGIBLE) {
    const posPlayers = byPosition.get(pos) ?? [];
    flexCandidates.push(...posPlayers.filter((p) => !usedPlayerIds.has(p.player.id)));
  }
  flexCandidates.sort((a, b) => b.weekPoints - a.weekPoints);

  if (flexCandidates.length > 0) {
    const flexPlayer = flexCandidates[0];
    starters.push({ ...flexPlayer, assignedSlot: "FLEX" });
    usedPlayerIds.add(flexPlayer.player.id);
  }

  // Remaining players are on bench
  const bench = playersWithWeekPoints
    .filter((p) => !usedPlayerIds.has(p.player.id))
    .map((p) => ({
      slot: p.slot,
      player: p.player,
    }));

  const totalPoints = starters.reduce((sum, s) => sum + s.weekPoints, 0);

  return {
    starters: starters.map((s) => ({
      slot: s.assignedSlot,
      player: s.player,
    })),
    bench,
    totalPoints,
  };
}

/**
 * Calculate total best-ball points across all playoff weeks
 */
export function calculateTotalBestBallPoints(
  roster: RosterPlayer[],
  weeks: number[] = [1, 2, 3, 5] // Playoff weeks (no week 4 = Pro Bowl)
): { weeklyTotals: { week: number; points: number }[]; total: number } {
  const weeklyTotals: { week: number; points: number }[] = [];
  let total = 0;

  for (const week of weeks) {
    const lineup = calculateBestBallLineup(roster, week);
    weeklyTotals.push({ week, points: lineup.totalPoints });
    total += lineup.totalPoints;
  }

  return { weeklyTotals, total };
}
