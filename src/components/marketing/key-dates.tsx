import { formatCalendarDay, SEASON_CALENDAR } from "@/lib/season-calendar";

const DATES = [
  { day: SEASON_CALENDAR.fieldSet, title: "Playoff field set", body: "Week 18 ends. Drafts open." },
  { day: SEASON_CALENDAR.wildCardStart, title: "Wild Card kickoff", body: "Drafts need to be finished. Scoring starts." },
  { day: SEASON_CALENDAR.superBowl, title: "Super Bowl", body: "Most total points wins." },
];

export function KeyDates() {
  return (
    <ol data-testid="key-dates" className="grid gap-3 sm:grid-cols-3">
      {DATES.map((d) => (
        <li key={d.day} className="rounded-lg bg-brand-tint p-4">
          <p className="font-mono text-sm font-semibold text-brand">{formatCalendarDay(d.day)}</p>
          <p className="mt-1 font-semibold text-ink">{d.title}</p>
          <p className="text-sm text-ink-soft">{d.body}</p>
        </li>
      ))}
    </ol>
  );
}
