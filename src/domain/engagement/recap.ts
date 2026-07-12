import type { LeagueScores } from "@/lib/league-scores";

export interface RecapEntry {
  entryId: string;
  name: string;
  ownerName: string;
  rank: number;
  prevRank: number;
  weekPoints: number;
  totalThroughWeek: number;
}

export interface WeeklyRecap {
  week: number;
  entries: RecapEntry[]; // sorted by rank
  topPerformer: { entryId: string; name: string; weekPoints: number };
}

function ranksThrough(scores: LeagueScores, week: number): Map<string, number> {
  const totals = scores.entries.map((e) => ({
    entryId: e.entryId,
    total: e.weeks.filter((w) => w.week <= week).reduce((s, w) => s + w.total, 0),
  }));
  totals.sort((a, b) => b.total - a.total);
  return new Map(totals.map((t, i) => [t.entryId, i + 1]));
}

/** Pure: standings through `week`, movement vs the week before, and the week's top score. */
export function buildWeeklyRecap(scores: LeagueScores, week: number): WeeklyRecap {
  const now = ranksThrough(scores, week);
  const before = week > 1 ? ranksThrough(scores, week - 1) : now;

  const entries: RecapEntry[] = scores.entries
    .map((e) => ({
      entryId: e.entryId,
      name: e.name,
      ownerName: e.ownerName,
      rank: now.get(e.entryId)!,
      prevRank: before.get(e.entryId)!,
      weekPoints: e.weeks.find((w) => w.week === week)?.total ?? 0,
      totalThroughWeek: e.weeks.filter((w) => w.week <= week).reduce((s, w) => s + w.total, 0),
    }))
    .sort((a, b) => a.rank - b.rank);

  const top = [...entries].sort((a, b) => b.weekPoints - a.weekPoints)[0];
  return {
    week,
    entries,
    topPerformer: { entryId: top.entryId, name: top.name, weekPoints: top.weekPoints },
  };
}
