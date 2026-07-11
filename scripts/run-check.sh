#!/bin/bash
source ~/.nvm/nvm.sh
nvm use 20
set -a
source .env.local
set +a
node scripts/check-duplicates.mjs
