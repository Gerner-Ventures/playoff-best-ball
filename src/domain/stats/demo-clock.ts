// Where a demo's playoff rounds sit on the calendar.
//
// A demo season is a fiction: the games really happened (or were fabricated), but
// the demo claims they are happening *now*. Rounds already played must sit in the
// past and rounds still to come in the future, because the app derives real
// behavior from those dates:
//
//   - league-projections.ts: nextWeek = the lowest week whose games are not FINAL
//   - due-work.ts:           previews fire for games starting within 48 hours
//   - the admin panel and league UI show kickoff times to a human
//
// Anchoring to `now` at seed time (rather than hardcoding dates the way
// buildMockWeek did, with a fixed 2027) is what keeps a long-lived demo from
// drifting into a state where its "upcoming" games are in the past.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Real playoff rounds are a week apart; the demo keeps that rhythm. */
export const DEMO_ROUND_SPACING_DAYS = 7;

/**
 * How long ago the most recently played round kicked off.
 *
 * Chosen so the NEXT round lands inside the 48-hour preview window that
 * due-work.ts uses (7 - 5.5 = 1.5 days out). At a smaller lead the next round
 * sits ~5 days away, previews never become due, and that whole surface is dead on
 * the demo. It also happens to read more naturally: last round last weekend, next
 * round this weekend — the real Sunday-to-Saturday playoff cadence.
 */
export const DEMO_CURRENT_ROUND_LEAD_DAYS = 5.5;

/**
 * Kickoff instant for playoff `week` on a demo where weeks 1..`playedThroughWeek`
 * are complete.
 *
 * The round played most recently sits `DEMO_CURRENT_ROUND_LEAD_DAYS` in the past,
 * and every other round steps a week from there. So with `playedThroughWeek = 2`:
 * week 2 kicked off 5.5 days ago, week 3 is 1.5 days out, week 4 is 8.5.
 *
 * Callers add each game's real offset within its round on top, so a Saturday
 * early game and a Sunday night game stay distinguishable.
 */
export function demoRoundStart(week: number, playedThroughWeek: number, now: Date): Date {
  const weeksFromCurrent = week - playedThroughWeek;
  return new Date(
    now.getTime() +
      weeksFromCurrent * DEMO_ROUND_SPACING_DAYS * DAY_MS -
      DEMO_CURRENT_ROUND_LEAD_DAYS * DAY_MS,
  );
}
