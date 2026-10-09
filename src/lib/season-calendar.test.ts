import { describe, it, expect } from "vitest";
import { formatCalendarDay, SEASON_CALENDAR } from "./season-calendar";

describe("season calendar", () => {
  it("formats calendar days without timezone drift", () => {
    expect(formatCalendarDay(SEASON_CALENDAR.fieldSet)).toBe("Sun, Jan 10");
    expect(formatCalendarDay(SEASON_CALENDAR.wildCardStart)).toBe("Sat, Jan 16");
    expect(formatCalendarDay(SEASON_CALENDAR.superBowl)).toBe("Sun, Feb 14");
  });

  it("puts the field being set before Wild Card weekend", () => {
    expect(SEASON_CALENDAR.fieldSet < SEASON_CALENDAR.wildCardStart).toBe(true);
  });
});
