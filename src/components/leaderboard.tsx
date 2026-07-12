import Link from "next/link";
import type { LeagueScores } from "@/lib/league-scores";

const WEEK_LABELS: Record<number, string> = { 1: "WC", 2: "DIV", 3: "CONF", 4: "SB" };

export function Leaderboard({ leagueId, scores }: { leagueId: string; scores: LeagueScores }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="p-2">#</th>
            <th className="p-2">Team</th>
            {scores.weeks.map((w) => (
              <th key={w} className="p-2 text-right">{WEEK_LABELS[w] ?? w}</th>
            ))}
            <th className="p-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {scores.entries.map((entry, i) => (
            <tr key={entry.entryId} className="border-b last:border-b-0">
              <td className="p-2 text-gray-500">{i + 1}</td>
              <td className="p-2">
                <Link href={`/leagues/${leagueId}/entries/${entry.entryId}`} className="font-medium hover:underline">
                  {entry.name}
                </Link>
                <span className="ml-2 text-gray-500">{entry.ownerName}</span>
              </td>
              {entry.weeks.map((w) => (
                <td key={w.week} className="p-2 text-right tabular-nums">
                  {w.total > 0 ? w.total.toFixed(2) : "—"}
                </td>
              ))}
              <td className="p-2 text-right font-semibold tabular-nums">{entry.grandTotal.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
