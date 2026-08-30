-- No down-migration: this is additive (new column + index) and the backfill is
-- derived, not destructive. Reversing it means dropping the index and column,
-- which also means downgrading better-auth below 1.7.
--
-- Runs in one transaction, so the UPDATE, the SET NOT NULL and the (non-
-- concurrent) CREATE UNIQUE INDEX hold a lock on `account` for the duration.
-- Logins contend for those rows, so expect a brief blip on the deploy that
-- applies this rather than a fully transparent migration.
--
-- better-auth 1.7 scopes account identity by `issuer`, which is NOT NULL with a
-- unique (issuer, accountId). Existing rows predate the column, so add it
-- nullable, backfill, then enforce — a plain NOT NULL add would fail on any
-- existing row.
ALTER TABLE "account" ADD COLUMN "issuer" TEXT;

-- Backfill mirrors better-auth's own issuer builders under identityStrategy
-- "provider-id": createLocalAccountIssuer("credential") -> 'local:credential',
-- createOAuthAccountIssuer(id) -> 'local:oauth:<id>'
-- (@better-auth/core/dist/db/schema/account.mjs:38,46). Deriving from providerId
-- means this is correct for whatever rows exist, without assuming the mix.
UPDATE "account"
SET "issuer" = CASE
  WHEN "providerId" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || "providerId"
END;

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;

-- Aborts the migration if duplicates exist rather than dropping rows. Verified
-- zero duplicate (providerId, accountId) pairs in production before writing this.
CREATE UNIQUE INDEX "account_issuer_accountId_key" ON "account"("issuer", "accountId");
