#!/usr/bin/env bash
# Build & run the Blurt port of Denser (blog on :3000, wallet on :4000).
# Usage:  ./scripts/blurt-setup.sh [dev|build|start]
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-dev}"

command -v pnpm >/dev/null || { corepack enable && corepack prepare pnpm@10.0.0 --activate; }

# The lockfile does not contain @beblurt/dblurt yet: first install must update it.
pnpm install --no-frozen-lockfile

# react-env reads .env; use the Blurt profile
for app in blog wallet; do cp "apps/$app/.env.blurt" "apps/$app/.env"; done

case "$MODE" in
  dev)   pnpm dev:blog & pnpm dev:wallet & wait ;;
  build) pnpm build:blog && pnpm build:wallet ;;
  start) pnpm start:blog & pnpm start:wallet & wait ;;
  *) echo "unknown mode $MODE"; exit 1 ;;
esac
