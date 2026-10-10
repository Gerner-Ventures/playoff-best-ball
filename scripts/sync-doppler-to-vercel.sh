#!/usr/bin/env bash
#
# Push every secret from a Doppler config into the matching Vercel environment:
# prd -> Production, stg -> Preview. Idempotent — re-run after adding or changing
# secrets in Doppler. Reserved DOPPLER_* vars and parked *_LIVE names are skipped.
#
# Prereqs (in THIS terminal): `doppler` authed, `vercel` logged in, and the
# repo linked (`.vercel/` present from `vercel link`).
#
# Usage:  ./scripts/sync-doppler-to-vercel.sh [environment]
#         environment defaults to "production" (prd config); "preview" syncs the
#         stg config instead — never prd, see the case block below
set -euo pipefail

PROJECT="playoff-best-ball"
TARGET="${1:-production}"

# The Doppler config follows the Vercel environment. This is a safety property, not
# a convenience: CONFIG used to be hardcoded to "prd", so `sync ... preview` would
# have pushed PRODUCTION secrets into the Preview environment — including
# DATABASE_URL, pointing every preview deployment at the production database. That
# never fired only because `vercel env add <preview>` prompts for a Git branch and
# CI has no TTY, so the run died before writing anything.
case "$TARGET" in
  production) CONFIG="prd" ;;
  preview)    CONFIG="stg" ;;
  *) echo "Unknown target '$TARGET' (expected: production, preview)"; exit 1 ;;
esac

command -v doppler >/dev/null || { echo "doppler CLI not found"; exit 1; }
command -v vercel  >/dev/null || { echo "vercel CLI not found"; exit 1; }
# Locally the repo is linked via `vercel link`. In CI there is no .vercel/, so
# reconstruct it from the org/project ids the workflow provides.
if [ ! -f .vercel/project.json ]; then
  if [ -n "${VERCEL_ORG_ID:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ]; then
    mkdir -p .vercel
    printf '{"projectId":"%s","orgId":"%s"}\n' "$VERCEL_PROJECT_ID" "$VERCEL_ORG_ID" > .vercel/project.json
  else
    echo "Repo not linked — run 'vercel link', or set VERCEL_ORG_ID and VERCEL_PROJECT_ID"
    exit 1
  fi
fi

# In CI the Vercel CLI does not pick the token up from the environment for
# `env add`; pass it (and the scope) explicitly. Empty locally, where the CLI
# uses the logged-in session.
VERCEL_ARGS=()
# if-blocks, not `[ ] && ...`: under `set -e` a false test would exit the script.
if [ -n "${VERCEL_TOKEN:-}" ]; then VERCEL_ARGS+=(--token "$VERCEL_TOKEN"); fi
if [ -n "${VERCEL_ORG_ID:-}" ]; then VERCEL_ARGS+=(--scope "$VERCEL_ORG_ID"); fi

# Names to push: all prd secrets minus Doppler's own reserved trio, minus anything
# suffixed _LIVE. The _LIVE names are parked copies of live-mode credentials kept for
# the launch swap (see production-setup.md §5) — no code reads them, so syncing them
# would load a live payment credential into the app's runtime env for nothing.
#
# Today that suffix covers exactly: STRIPE_SECRET_KEY_LIVE, STRIPE_WEBHOOK_SECRET_LIVE,
# STRIPE_PUBLISH_KEY_LIVE. Note the skip is silent — if you ever add a secret the app
# genuinely needs whose name happens to end in _LIVE, it will not reach Vercel and
# nothing will tell you. Rename it, or narrow this filter to the names above.
#
# A read loop rather than `mapfile`: macOS ships bash 3.2, which has no mapfile, and
# this script is meant to run from an operator's terminal as well as from CI.
# Values reach python on stdin, never argv, so they stay out of the process list.
SECRETS_JSON="$(doppler secrets download --no-file --format json --project "$PROJECT" --config "$CONFIG")"
KEYS=()
while IFS= read -r k; do KEYS+=("$k"); done < <(
  printf '%s' "$SECRETS_JSON" \
    | python3 -c "import json,sys; [print(k) for k in json.load(sys.stdin) if not k.startswith('DOPPLER_') and not k.endswith('_LIVE')]"
)
# Also keeps the loops below safe: bash 3.2 treats "${KEYS[@]}" on an empty array
# as unbound under `set -u`.
if [ ${#KEYS[@]} -eq 0 ]; then
  echo "Doppler $PROJECT/$CONFIG returned no secrets — refusing to sync an empty set"
  exit 1
fi

# Preview runs every PR's code, so stg must not carry credentials that reach
# production systems. stg started life as a copy of prd, production Inngest keys
# included, which would have let every preview register functions with — and fire
# crons through — the production Inngest app. Check the whole set before writing
# anything, so a bad config fails without leaving Preview half-synced.
#   INNGEST_*            previews deliberately run without Inngest (production-setup.md §2)
#   DATABASE_URL*, POSTGRES_*, PG*, NEON_*
#                        Preview's database is owned by the Neon integration, not Doppler
#   any STRIPE_* value   must not be live-mode; a live key on a preview could take real money
if [ "$TARGET" = "preview" ]; then
  violations=()
  for k in "${KEYS[@]}"; do
    case "$k" in
      INNGEST_*|DATABASE_URL|DATABASE_URL_UNPOOLED|POSTGRES_*|PG*|NEON_*)
        violations+=("$k must not be set for Preview") ;;
    esac
  done
  while IFS= read -r k; do
    [ -n "$k" ] && violations+=("$k is a live-mode Stripe key")
  done < <(
    printf '%s' "$SECRETS_JSON" | python3 -c "
import json, sys
for k, v in json.load(sys.stdin).items():
    if k.startswith('STRIPE_') and not k.endswith('_LIVE') and str(v).startswith(('sk_live_', 'pk_live_', 'rk_live_')):
        print(k)"
  )
  if [ ${#violations[@]} -gt 0 ]; then
    echo "Refusing to sync Doppler $PROJECT/$CONFIG -> Vercel preview:"
    printf '  ✗ %s\n' "${violations[@]}"
    exit 1
  fi
fi

echo "Syncing ${#KEYS[@]} secrets from Doppler $PROJECT/$CONFIG -> Vercel $TARGET"
for k in "${KEYS[@]}"; do
  v="$(doppler secrets get "$k" --plain --project "$PROJECT" --config "$CONFIG")"
  # --force overwrites an existing value; printf (no trailing newline) keeps the value exact.
  # --yes accepts the default for the "Git branch?" prompt that a preview target
  # triggers (default = all preview branches). Without it the CLI blocks forever in
  # CI, which has no TTY. The value stays on stdin rather than --value so it never
  # appears in the process list.
  printf '%s' "$v" | vercel env add "$k" "$TARGET" --force --yes ${VERCEL_ARGS[@]+"${VERCEL_ARGS[@]}"} >/dev/null
  echo "  ✓ $k"
done

echo "Done. Verify with:  vercel env ls $TARGET"
echo "NOTE: NEXT_PUBLIC_* are build-time — trigger a redeploy for them to take effect."
