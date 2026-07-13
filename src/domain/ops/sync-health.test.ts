import { describe, it, expect, beforeEach } from "vitest";
import { testDb, resetDb } from "../../../tests/helpers/db";
import { recordSyncOutcome, ALERT_THRESHOLD } from "./sync-health";

describe("recordSyncOutcome", () => {
  beforeEach(resetDb);

  it("alerts once when failures reach the threshold, then stays quiet until recovery", async () => {
    for (let i = 1; i < ALERT_THRESHOLD; i++) {
      const r = await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: false, error: "boom" });
      expect(r.shouldAlert).toBe(false);
    }
    const atThreshold = await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: false, error: "boom" });
    expect(atThreshold.shouldAlert).toBe(true);
    expect(atThreshold.consecutiveFailures).toBe(ALERT_THRESHOLD);

    // further failures do NOT re-alert
    const after = await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: false, error: "boom" });
    expect(after.shouldAlert).toBe(false);

    // success resets and reports recovery (because we had alerted)
    const recovered = await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: true });
    expect(recovered.recovered).toBe(true);
    expect(recovered.consecutiveFailures).toBe(0);

    // success after a non-alerted blip is quiet
    await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: false, error: "blip" });
    const quiet = await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: true });
    expect(quiet.recovered).toBe(false);
  });

  it("tracks jobs independently", async () => {
    for (let i = 0; i < ALERT_THRESHOLD; i++) {
      await recordSyncOutcome(testDb, { job: "stats-sync-live", ok: false, error: "x" });
    }
    const other = await recordSyncOutcome(testDb, { job: "odds-sync", ok: false, error: "y" });
    expect(other.shouldAlert).toBe(false);
    expect(other.consecutiveFailures).toBe(1);
  });
});
