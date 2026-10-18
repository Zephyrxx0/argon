#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Argon Production Showcase Seeder
# Seeds ember-adr-showcase, synthetic-demo, and argon-dogfood into FalkorDB
# ==============================================================================

echo "===> Seeding showcase workspaces into FalkorDB..."

ENV_FILE=".env.production"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE=".env"
fi

docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" run --rm seeder

echo "===> Showcase seeded successfully! Refresh your browser to view the workspaces."
