/**
 * The dates the marketing pages quote. Checked against ESPN's 2026 calendar on
 * 2026-10-09; the v1 spec's "Wild Card ~Jan 9" was a week early. Calendar days in
 * US Eastern, stored as ISO dates so they render the same in every timezone.
 * One edit per season.
 */
export const SEASON_CALENDAR = {
  season: 2026,
  /** Week 18 ends and the playoff field is known. Drafts can start. */
  fieldSet: "2027-01-10",
  /** Wild Card kickoff. Drafts must be done. */
  wildCardStart: "2027-01-16",
  wildCardEnd: "2027-01-18",
  superBowl: "2027-02-14",
} as const;

/** "Sun, Jan 10". The ISO date is read as a calendar day, not a UTC instant. */
export function formatCalendarDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
