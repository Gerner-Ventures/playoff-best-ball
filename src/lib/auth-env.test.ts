import { describe, it, expect } from "vitest";
import { assertBetterAuthSecret } from "./auth-env";

describe("assertBetterAuthSecret", () => {
  it("throws in production when the secret is missing or blank", () => {
    for (const secret of [undefined, "", "   "]) {
      expect(() => assertBetterAuthSecret(secret, "production")).toThrow(/BETTER_AUTH_SECRET/);
    }
  });

  it("names preview in the message, since that is the environment that forgets it", () => {
    expect(() => assertBetterAuthSecret(undefined, "production")).toThrow(/preview/i);
  });

  it("passes in production when a secret is set", () => {
    expect(() => assertBetterAuthSecret("s3cret-value", "production")).not.toThrow();
  });

  it("stays out of the way outside production", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      expect(() => assertBetterAuthSecret(undefined, nodeEnv)).not.toThrow();
    }
  });
});
