import { describe, it, expect } from "vitest";
import { captureServerEvent } from "./analytics-server";

describe("captureServerEvent", () => {
  it("is a silent no-op when POSTHOG_KEY is unset", async () => {
    // test env has no POSTHOG_KEY; must resolve without throwing or network I/O
    await expect(
      captureServerEvent("user-1", "league_created", { leagueId: "l1" }),
    ).resolves.toBeUndefined();
  });
});
