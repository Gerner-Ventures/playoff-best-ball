import { beforeEach, describe, expect, it } from "vitest";
import { testDb, resetDb } from "./helpers/db";
import {
  isDemoEnvironment,
  markDemoEnvironment,
  passwordAuthDecision,
} from "@/lib/demo-mode";

// The database sentinel is the one factor in the demo-mode gate that does not live
// in the environment. These tests pin the property that makes it worth having: no
// combination of environment variables allows password auth against a database that
// was never deliberately marked as a demo.

describe("passwordAuthDecision", () => {
  it("allows e2e regardless of the sentinel — its database is disposable", () => {
    expect(
      passwordAuthDecision({ e2eEnabled: true, demoRequested: false, sentinelPresent: false }),
    ).toBe(true);
  });

  it("refuses demo mode without the sentinel, however the env is configured", () => {
    expect(
      passwordAuthDecision({ e2eEnabled: false, demoRequested: true, sentinelPresent: false }),
    ).toBe(false);
  });

  it("refuses the sentinel without the env opt-in", () => {
    // A demo database restored into another deployment must not carry demo mode with it.
    expect(
      passwordAuthDecision({ e2eEnabled: false, demoRequested: false, sentinelPresent: true }),
    ).toBe(false);
  });

  it("allows only when the env attests AND the database is marked", () => {
    expect(
      passwordAuthDecision({ e2eEnabled: false, demoRequested: true, sentinelPresent: true }),
    ).toBe(true);
  });

  it("refuses when nothing is set", () => {
    expect(
      passwordAuthDecision({ e2eEnabled: false, demoRequested: false, sentinelPresent: false }),
    ).toBe(false);
  });
});

describe("isDemoEnvironment", () => {
  beforeEach(async () => {
    await resetDb();
    await testDb.demoEnvironment.deleteMany();
  });

  it("is false for a database that was never marked", async () => {
    expect(await isDemoEnvironment(testDb)).toBe(false);
  });

  it("is true once the database is marked", async () => {
    await markDemoEnvironment(testDb, "integration test");
    expect(await isDemoEnvironment(testDb)).toBe(true);
  });

  it("marking is idempotent — re-seeding must not fail on the sentinel", async () => {
    await markDemoEnvironment(testDb, "first");
    await markDemoEnvironment(testDb, "second");
    expect(await testDb.demoEnvironment.count()).toBe(1);
  });

  it("goes false again when the sentinel is removed", async () => {
    // Revoking demo status from a database must take effect immediately, not at
    // the next process restart — which is why this lookup is not cached.
    await markDemoEnvironment(testDb, "temporary");
    expect(await isDemoEnvironment(testDb)).toBe(true);
    await testDb.demoEnvironment.deleteMany();
    expect(await isDemoEnvironment(testDb)).toBe(false);
  });

  it("survives resetDb, so the demo database stays a demo database", async () => {
    // resetDb() is the e2e/unit clean-slate helper. If it wiped the sentinel, a
    // reset would silently downgrade a demo database and password auth would stop.
    await markDemoEnvironment(testDb, "persistent");
    await resetDb();
    expect(await isDemoEnvironment(testDb)).toBe(true);
  });
});
