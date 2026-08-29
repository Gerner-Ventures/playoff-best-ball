import type { LeagueProjections } from "@/lib/league-projections";

const WEEK_LABELS: Record<number, string> = { 1: "Wild Card", 2: "Divisional", 3: "Conference", 4: "Super Bowl" };

export function ProjectionsTable({ projections }: { projections: LeagueProjections }) {
  if (projections.nextWeek === null) return null; // season over: nothing left to project
  return (
    <section className="mt-8">
      <h2 className="mb-1 flex items-center gap-2 chalk chalk-h2 text-3xl text-chalk-mint">
        Projections
        <span className="chalk-badge">PREMIUM</span>
      </h2>
      <p className="mb-3 text-sm text-chalk-dim">
        Projected {WEEK_LABELS[projections.nextWeek]} points — recent scoring × Vegas win probabilities, best-ball lineup.
      </p>
      <ul className="text-sm chalk-card">
        {projections.entries.map((entry, i) => (
          <li key={entry.entryId} className="flex items-center justify-between border-b p-2 last:border-b-0 border-chalk-line">
            {/* No alive count here: the leaderboard's Alive column is authoritative; projections resolve
                eliminations at nextWeek, which can disagree when a substitution has a future effectiveWeek. */}
            <span>
              <span className="mr-2 text-chalk-dim">{i + 1}</span>
              <span className="font-medium">{entry.name}</span>
            </span>
            <span className="font-semibold tabular">{entry.projectedTotal.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
