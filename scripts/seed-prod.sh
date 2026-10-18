#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Argon Production Showcase Seeder
# Seeds ember-adr-showcase, synthetic-demo, and argon-dogfood into FalkorDB
# ==============================================================================

echo "===> Seeding showcase workspaces into FalkorDB..."

docker compose -f docker-compose.prod.yml run --rm seeder

echo "===> Showcase seeded successfully! Refresh your browser to view Ember.js ADR Corpus."

