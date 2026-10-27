#!/bin/sh
# Container entrypoint. MIGRATE_ON_START=true (office stack) applies migrations before the server starts. Production
# leaves it off: production/deploy.sh runs migrations as a separate, visible step. No admin is created here: the first
# administrator is made in the /setup wizard.
set -e
if [ "$MIGRATE_ON_START" = "true" ]; then
  node scripts/migrate.js
fi
exec "$@"
