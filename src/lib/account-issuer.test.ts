import { describe, it, expect } from "vitest";
import { createLocalAccountIssuer, createOAuthAccountIssuer } from "better-auth/db";

/**
 * Drift guard for the account-issuer backfill.
 *
 * `prisma/migrations/20260830000000_account_issuer` backfills pre-1.7 rows with
 *
 *   CASE WHEN "providerId" = 'credential' THEN 'local:credential'
 *        ELSE 'local:oauth:' || "providerId" END
 *
 * which only stays correct while better-auth keeps writing those same strings for
 * new accounts. Nothing else in CI covers that: the e2e suite authenticates
 * exclusively through the E2E_TEST_MODE password path (src/lib/auth.ts), so the
 * OAuth and magic-link issuer formats are never exercised end-to-end.
 *
 * If a better-auth upgrade changes these builders, this fails here rather than in
 * production, where the symptom would be existing users unable to log in because
 * their stored issuer no longer matches the one being looked up.
 */
describe("better-auth issuer format matches the migration backfill", () => {
  it("writes local:credential for password and magic-link accounts", () => {
    expect(createLocalAccountIssuer("credential")).toBe("local:credential");
  });

  it("writes local:oauth:<providerId> for the social providers auth.ts registers", () => {
    expect(createOAuthAccountIssuer("google")).toBe("local:oauth:google");
    expect(createOAuthAccountIssuer("apple")).toBe("local:oauth:apple");
  });

  it("namespaces OAuth separately from local, so a providerId cannot collide", () => {
    // The backfill's ELSE branch assumes every non-credential providerId lands in
    // the oauth namespace; if these ever converged, a 'credential' OAuth provider
    // could collide with the local credential account under the unique index.
    expect(createOAuthAccountIssuer("credential")).not.toBe(
      createLocalAccountIssuer("credential"),
    );
  });
});
