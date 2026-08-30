import { describe, expect, it } from "vitest";
import { demoRoundStart, DEMO_ROUND_SPACING_DAYS } from "./demo-clock";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-08-29T18:00:00.000Z");

// A demo's bracket is a fiction anchored to whenever it was seeded: rounds already
// played sit in the past, rounds still to come sit in the future. Without that,
// nextWeek/projections and the 48h preview window have nothing sensible to read.

describe("demoRoundStart", () => {
  it("puts the most recently played round in the past", () => {
    const wk2 = demoRoundStart(2, 2, now);
    expect(wk2.getTime()).toBeLessThan(now.getTime());
  });

  it("puts every unplayed round in the future", () => {
    for (const week of [3, 4]) {
      expect(demoRoundStart(week, 2, now).getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("puts every played round in the past", () => {
    for (const week of [1, 2]) {
      expect(demoRoundStart(week, 2, now).getTime()).toBeLessThan(now.getTime());
    }
  });

  it("spaces rounds a week apart, in order", () => {
    const starts = [1, 2, 3, 4].map((w) => demoRoundStart(w, 2, now).getTime());
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBe(DEMO_ROUND_SPACING_DAYS * DAY);
    }
  });

  it("puts the next unplayed round within the 48h preview window", () => {
    // due-work.ts previews games starting in [now, now+48h]. A demo seeded at
    // week N should have week N+1 inside that window, or previews never fire.
    const next = demoRoundStart(3, 2, now).getTime() - now.getTime();
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThanOrEqual(48 * 60 * 60 * 1000);
  });

  it("handles a season with nothing played — every round is upcoming", () => {
    for (const week of [1, 2, 3, 4]) {
      expect(demoRoundStart(week, 0, now).getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("handles a completed season — every round is past", () => {
    for (const week of [1, 2, 3, 4]) {
      expect(demoRoundStart(week, 4, now).getTime()).toBeLessThan(now.getTime());
    }
  });

  it("is pure — same inputs, same instant", () => {
    expect(demoRoundStart(3, 2, now).getTime()).toBe(demoRoundStart(3, 2, now).getTime());
  });
});
