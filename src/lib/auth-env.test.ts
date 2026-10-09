import { describe, it, expect } from "vitest";
import { assertBetterAuthSecret } from "./auth-env";

describe("assertBetterAuthSecret", () => {
  it("throws in production when the secret is missing or blank", () => {
    for (const secret of [undefined, "", "   "]) {
      expect(() =>
        assertBetterAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: secret }),
      ).toThrow(/BETTER_AUTH_SECRET/);
    }
  });

  it("names preview in the message, since that is the environment that forgets it", () => {
    expect(() => assertBetterAuthSecret({ NODE_ENV: "production" })).toThrow(/preview/i);
  });

  it("passes in production when a secret is set", () => {
    expect(() =>
      assertBetterAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRET: "s3cret-value" }),
    ).not.toThrow();
  });

  // better-auth resolves its secret from these too, so rejecting them would fail
  // a build that would have run fine.
  it("accepts the other variables better-auth reads its secret from", () => {
    expect(() =>
      assertBetterAuthSecret({ NODE_ENV: "production", AUTH_SECRET: "s3cret-value" }),
    ).not.toThrow();
    expect(() =>
      assertBetterAuthSecret({ NODE_ENV: "production", BETTER_AUTH_SECRETS: "1:s3cret-value" }),
    ).not.toThrow();
  });

  it("stays out of the way outside production", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      expect(() => assertBetterAuthSecret({ NODE_ENV: nodeEnv })).not.toThrow();
    }
  });
});
