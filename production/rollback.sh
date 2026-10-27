#!/usr/bin/env bash
# Put the previous app image back after a failed deploy:
#   /srv/docker/zeronix/production/rollback.sh            -> zeronix-app:previous
#   /srv/docker/zeronix/production/rollback.sh 51793c4    -> a specific earlier build (docker images zeronix-app)
#
# Only the app container changes. The database is NOT rolled back: if the failed deploy ran a migration the old code
# cannot work with, restore the pre-deploy backup as described in production/README.md (Rollback).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
COMPOSE=(docker compose -f "$ROOT/docker-compose.prod.yml")
APP=zeronix-app
TARGET="${1:-previous}"

docker image inspect "$APP:$TARGET" >/dev/null 2>&1 || { echo "image $APP:$TARGET not found" >&2; exit 1; }

echo "switching $APP to $APP:$TARGET"
docker tag "$APP:$TARGET" "$APP:latest"
"${COMPOSE[@]}" up -d --no-build "$APP"

STATUS=starting
for _ in $(seq 1 40); do
  STATUS="$(docker inspect --format '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo missing)"
  [ "$STATUS" = "healthy" ] && break
  [ "$STATUS" = "unhealthy" ] && break
  sleep 3
done
echo "$APP is $STATUS"
[ "$STATUS" = "healthy" ]
