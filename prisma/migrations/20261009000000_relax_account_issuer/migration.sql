-- better-auth 1.7.3 removed the account `issuer` that 1.7.0 introduced
-- (20260830000000_account_issuer) and went back to recognising accounts by
-- (providerId, accountId), as in 1.6. It no longer writes issuer, so the NOT NULL
-- would fail every account insert — sign-up, magic link, OAuth linking — and the
-- unique (issuer, accountId) has nothing left to enforce.
--
-- Follows the upgrade guide's PostgreSQL remediation
-- (https://www.better-auth.com/docs/guides/1-7-upgrade-guide): relax the column
-- and drop the index, but keep the column. A rollback to a 1.7.2 build, which
-- looks accounts up by issuer, then still logs in every account created before
-- this deploy; dropping the column would break every login on rollback. A later
-- migration can drop it once 1.7.3+ has settled.
--
-- No replacement unique index: the guide recommends none, and the pre-1.7 schema
-- had none on (providerId, accountId).
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;

DROP INDEX "account_issuer_accountId_key";
