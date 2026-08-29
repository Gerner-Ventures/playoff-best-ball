# Schema Changes & Deploy Pipeline

How database schema reaches production, and what CI enforces.

## The short version

1. Edit `prisma/schema.prisma`.
2. Run `npm run db:migrate -- --name describe_the_change`. This writes
   `prisma/migrations/<timestamp>_describe_the_change/migration.sql` and applies it
   to your local dev database.
3. Commit the migration **with** the schema change. They travel together.
4. Open a PR. CI fails if the schema changed without a matching migration.
5. On merge, Vercel's build runs `prisma migrate deploy` before `next build`, so
   production applies the migration itself.

There is no manual step. `prisma db push` is still available for throwaway local
experiments, but it must never be used against production — it makes no record,
so the next `migrate deploy` cannot know what happened.

## Why this exists

Before this pipeline, schema changes were applied by hand with
`prisma db push` against the production database. That meant no version history,
nothing to review in a PR, no rollback, and no way to tell whether production
matched `schema.prisma`. The `MockDraft` table shipped in code before the table
existed in production, which is exactly the failure this prevents.

## What CI checks

`.github/workflows/ci.yml` runs on every PR:

| Step | Catches |
|---|---|
| `db:migrate:test` | A migration that does not apply cleanly to an empty database |
| `migrate diff --from-migrations --to-schema --exit-code` | A schema change with no migration to match |
| lint / typecheck / unit tests / build / e2e | Everything else |

The drift check replays every migration into a scratch shadow database and
compares the result to `schema.prisma`. It exits non-zero on any difference, so a
schema edit without a migration fails the PR rather than production.

## One-time baseline (already done — recorded here for reference)

Production predates this pipeline, so its tables already existed. Applying
`00000000000000_baseline` would have tried to `CREATE TABLE` over live tables and
failed. It was therefore marked as already-applied without running:

```bash
doppler run -p playoff-best-ball -c prd -- npx prisma migrate resolve \
  --applied 00000000000000_baseline
```

Any database created **after** this point (preview branches, a fresh local clone,
CI) simply runs every migration from empty and needs no baselining.

## Preview databases

Preview deployments get their own Neon branch per pull request, so previews run
against a real schema instead of an empty database. The branch is created when
the PR opens and dropped when it closes; migrations apply during the preview
build like any other deploy.

## Rolling back

Prisma has no automatic down-migrations. To reverse a change, write a new
migration that undoes it and deploy forward. For an emergency, redeploy the
previous Vercel build — but note that a deploy rollback does **not** roll back
schema, so prefer additive, backwards-compatible migrations: add columns as
nullable or with defaults, and drop them in a later release once no running code
references them.
