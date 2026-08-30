#!/usr/bin/env bash
#
# Vercel build entrypoint.
#
# Migrations run for PRODUCTION DEPLOYS ONLY. Two reasons, and the second is the
# important one:
#
# 1. Preview deploys point at a different database. Vercel resolves DATABASE_URL
#    per environment, and the Preview/Development value still comes from the
#    original Neon integration (ep-dawn-dream-…), which holds the pre-rebuild
#    prototype schema — Owner, Roster, PlayerScore — and no _prisma_migrations
#    table. `prisma migrate deploy` against it fails with P3005 ("The database
#    schema is not empty"), which is why every PR's preview deploy was red.
#
# 2. A build must never migrate a database on a PR's say-so. `migrate deploy`
#    applies whatever migrations the branch contains, to whatever DATABASE_URL
#    resolves to at that moment. Gating on VERCEL_ENV means an unreviewed branch
#    cannot reshape a database by being deployed, whatever preview is pointed at
#    later.
#
# Migrations are still exercised on every PR: ci.yml builds the test database
# from migrations rather than `db push`, and runs a drift gate that replays them
# into a shadow database and fails when schema.prisma has no matching migration.
# CI is the right place for that check — a deploy is not.
set -euo pipefail

# Vercel puts node_modules/.bin on PATH for `buildCommand`, but a script invoked
# from it does not inherit that reliably, and it is absent when running this by
# hand. Make the local binaries explicit so `prisma` and `next` resolve either way.
export PATH="$PWD/node_modules/.bin:$PATH"

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "▲ production deploy — applying migrations"
  prisma migrate deploy
else
  echo "▲ ${VERCEL_ENV:-unknown} deploy — skipping migrations (production-only)"
fi

next build
