import type { LeagueProjections } from "@/lib/league-projections";

const WEEK_LABELS: Record<number, string> = { 1: "Wild Card", 2: "Divisional", 3: "Conference", 4: "Super Bowl" };

export function ProjectionsTable({ projections }: { projections: LeagueProjections }) {
  if (projections.nextWeek === null) return null; // season over: nothing left to project
  return (
    <section className="mt-8">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        Projections
        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">PREMIUM</span>
      </h2>
      <p className="mb-3 text-sm text-gray-500">
        Projected {WEEK_LABELS[projections.nextWeek]} points — recent scoring × Vegas win probabilities, best-ball lineup.
      </p>
      <ul className="rounded-lg border text-sm">
        {projections.entries.map((entry, i) => (
          <li key={entry.entryId} className="flex items-center justify-between border-b p-2 last:border-b-0">
            {/* No alive count here: the leaderboard's Alive column is authoritative; projections resolve
                eliminations at nextWeek, which can disagree when a substitution has a future effectiveWeek. */}
            <span>
              <span className="mr-2 text-gray-500">{i + 1}</span>
              <span className="font-medium">{entry.name}</span>
            </span>
            <span className="font-semibold tabular-nums">{entry.projectedTotal.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
