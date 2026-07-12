// The pick clock freezes overnight (1:00–8:00 ET) when the league enables overnightPause,
// so nobody loses their pick while asleep. Minute-granularity walk: pick clocks are
// hours long, deadlines don't need sub-minute precision, and walking avoids hand-rolled
// timezone math (Intl handles ET, including DST if a draft ever runs outside January).

const PAUSE_START_HOUR_ET = 1; // inclusive
const PAUSE_END_HOUR_ET = 8; // exclusive
const MINUTE_MS = 60_000;

const etHour = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  hourCycle: "h23",
});

function inPauseWindow(instant: Date): boolean {
  const hour = Number(etHour.format(instant));
  return hour >= PAUSE_START_HOUR_ET && hour < PAUSE_END_HOUR_ET;
}

export function computePickDeadline(
  from: Date,
  clockHours: number,
  overnightPause: boolean,
): Date {
  if (!overnightPause) return new Date(from.getTime() + clockHours * 3_600_000);
  let remainingMinutes = clockHours * 60;
  let cursor = from.getTime();
  // If the pick starts inside the pause window, advance to the window's end before
  // counting active minutes — the clock doesn't run while the window is active.
  while (inPauseWindow(new Date(cursor))) {
    cursor += MINUTE_MS;
  }
  while (remainingMinutes > 0) {
    cursor += MINUTE_MS;
    if (!inPauseWindow(new Date(cursor))) remainingMinutes -= 1;
  }
  return new Date(cursor);
}
