import { describe, it, expect } from "vitest";
import { computePickDeadline } from "./pick-clock";

describe("computePickDeadline", () => {
  it("without pause: from + clockHours exactly", () => {
    const from = new Date("2027-01-05T15:00:00Z"); // 10:00 ET
    expect(computePickDeadline(from, 8, false).toISOString()).toBe("2027-01-05T23:00:00.000Z");
  });

  it("clock that never touches the pause window is unaffected", () => {
    const from = new Date("2027-01-05T15:00:00Z"); // 10:00 ET
    expect(computePickDeadline(from, 4, true).toISOString()).toBe("2027-01-05T19:00:00.000Z");
  });

  it("pauses between 1am and 8am ET", () => {
    // 23:00 ET Jan 5 = 04:00Z Jan 6. 2h runs to 01:00 ET, pause to 08:00 ET, 2h more → 10:00 ET.
    const from = new Date("2027-01-06T04:00:00Z");
    expect(computePickDeadline(from, 4, true).toISOString()).toBe("2027-01-06T15:00:00.000Z");
  });

  it("a clock starting inside the pause window starts counting at 8am ET", () => {
    const from = new Date("2027-01-06T08:00:00Z"); // 03:00 ET
    expect(computePickDeadline(from, 2, true).toISOString()).toBe("2027-01-06T15:00:00.000Z"); // 10:00 ET
  });

  it("a 24h clock spans a full pause and lands 7h later than naive", () => {
    const from = new Date("2027-01-05T17:00:00Z"); // 12:00 ET
    // naive: 12:00 ET next day; one 1am–8am pause inside → +7h → 19:00 ET = 00:00Z Jan 7
    expect(computePickDeadline(from, 24, true).toISOString()).toBe("2027-01-07T00:00:00.000Z");
  });

  it("a clock starting exactly at 1:00 ET snaps to the pause exit before counting", () => {
    const from = new Date("2027-01-06T06:00:00Z"); // 01:00 ET
    expect(computePickDeadline(from, 2, true).toISOString()).toBe("2027-01-06T15:00:00.000Z"); // 10:00 ET
  });

  it("mid-walk crossing into the pause suspends the count", () => {
    const from = new Date("2027-01-06T04:00:00Z"); // 23:00 ET Jan 5
    // 2h to 01:00 ET, pause to 08:00 ET, 1h more → 09:00 ET
    expect(computePickDeadline(from, 3, true).toISOString()).toBe("2027-01-06T14:00:00.000Z");
  });
});
