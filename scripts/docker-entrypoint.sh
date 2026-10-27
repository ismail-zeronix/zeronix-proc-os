#!/bin/sh
# Container entrypoint. MIGRATE_ON_START=true (office stack) applies migrations and seeds the first admin before the
# server starts. Production leaves it off: production/deploy.sh runs migrations as a separate, visible step.
set -e
if [ "$MIGRATE_ON_START" = "true" ]; then
  node scripts/migrate.js
  node scripts/seed.js
fi
exec "$@"
