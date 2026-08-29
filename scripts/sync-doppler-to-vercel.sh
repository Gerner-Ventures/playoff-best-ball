#!/usr/bin/env bash
#
# Push every secret from Doppler (playoff-best-ball / prd) into the linked
# Vercel project's Production environment. Idempotent — re-run after adding
# or changing secrets in Doppler. Reserved DOPPLER_* vars are skipped.
#
# Prereqs (in THIS terminal): `doppler` authed, `vercel` logged in, and the
# repo linked (`.vercel/` present from `vercel link`).
#
# Usage:  ./scripts/sync-doppler-to-vercel.sh [environment]
#         environment defaults to "production" (use "preview" to also fill previews)
set -euo pipefail

PROJECT="playoff-best-ball"
CONFIG="prd"
TARGET="${1:-production}"

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

# Names to push (all prd secrets minus Doppler's own reserved trio).
mapfile -t KEYS < <(
  doppler secrets download --no-file --format json --project "$PROJECT" --config "$CONFIG" \
    | python3 -c "import json,sys; [print(k) for k in json.load(sys.stdin) if not k.startswith('DOPPLER_')]"
)

echo "Syncing ${#KEYS[@]} secrets from Doppler $PROJECT/$CONFIG -> Vercel $TARGET"
for k in "${KEYS[@]}"; do
  v="$(doppler secrets get "$k" --plain --project "$PROJECT" --config "$CONFIG")"
  # --force overwrites an existing value; printf (no trailing newline) keeps the value exact.
  printf '%s' "$v" | vercel env add "$k" "$TARGET" --force ${VERCEL_ARGS[@]+"${VERCEL_ARGS[@]}"} >/dev/null
  echo "  ✓ $k"
done

echo "Done. Verify with:  vercel env ls $TARGET"
echo "NOTE: NEXT_PUBLIC_* are build-time — trigger a redeploy for them to take effect."
