#!/usr/bin/env bash
# Deploy the latest main branch on the production server. Run from anywhere:
#   /srv/docker/zeronix/production/deploy.sh
#
# Steps: pre-flight checks -> git pull --ff-only -> build a new image tagged with the commit -> keep the running image
# as zeronix-app:previous -> start postgres -> back up the database -> run migrations -> start the new app -> wait
# until healthy. If anything fails the script stops; the app that was running keeps running until the final step.
# Never prunes images, containers or volumes.
#
# Options (environment variables):
#   SKIP_BACKUP=1   skip the pre-migration backup (not recommended)
#   BRANCH=main     branch to deploy
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BRANCH="${BRANCH:-main}"
COMPOSE=(docker compose -f "$ROOT/docker-compose.prod.yml")
APP=zeronix-app

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

log "Pre-flight checks"
[ -f "$ROOT/.env" ] || die ".env is missing in $ROOT (copy .env.example and fill in the [prod] values)"
docker network inspect proxy-net >/dev/null 2>&1 || die "external network proxy-net not found (Caddy's network)"
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || die "checked-out branch is not $BRANCH"
git diff --quiet && git diff --cached --quiet || die "uncommitted changes in $ROOT; the server copy must stay clean"
"${COMPOSE[@]}" config --quiet || die "docker-compose.prod.yml or .env is invalid"

log "Updating code from origin/$BRANCH"
git pull --ff-only origin "$BRANCH"
TAG="$(git rev-parse --short HEAD)"
echo "deploying commit $TAG"

log "Building image $APP:$TAG"
APP_IMAGE_TAG="$TAG" "${COMPOSE[@]}" build "$APP"

# Keep what is running now as the rollback target (by image id, so a failed earlier deploy never becomes "previous")
RUNNING_IMAGE="$(docker inspect --format '{{.Image}}' "$APP" 2>/dev/null || true)"
if [ -n "$RUNNING_IMAGE" ]; then
  docker tag "$RUNNING_IMAGE" "$APP:previous"
  echo "current image kept as $APP:previous"
else
  echo "no running $APP container (first deploy?), nothing to keep"
fi
docker tag "$APP:$TAG" "$APP:latest"

log "Starting PostgreSQL"
"${COMPOSE[@]}" up -d zeronix-postgres
for _ in $(seq 1 30); do
  [ "$(docker inspect --format '{{.State.Health.Status}}' zeronix-postgres 2>/dev/null)" = "healthy" ] && break
  sleep 2
done
[ "$(docker inspect --format '{{.State.Health.Status}}' zeronix-postgres)" = "healthy" ] || die "PostgreSQL is not healthy"

if [ "${SKIP_BACKUP:-0}" != "1" ] && [ -n "$RUNNING_IMAGE" ]; then
  log "Backing up the database before migrations"
  bash "$ROOT/production/backup-postgres.sh"
fi

log "Running migrations with the new image"
"${COMPOSE[@]}" run --rm --no-deps "$APP" node scripts/migrate.js

log "Starting the new app"
"${COMPOSE[@]}" up -d --no-build "$APP"

log "Waiting for the health check"
STATUS=starting
for _ in $(seq 1 40); do
  STATUS="$(docker inspect --format '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo missing)"
  [ "$STATUS" = "healthy" ] && break
  [ "$STATUS" = "unhealthy" ] && break
  sleep 3
done
if [ "$STATUS" != "healthy" ]; then
  docker logs --tail 50 "$APP" >&2 || true
  die "app is $STATUS after deploy. Roll back with: $ROOT/production/rollback.sh"
fi
docker exec "$APP" wget -qO- http://127.0.0.1:3000/api/health/db || die "app is up but cannot reach the database"

log "Deployed $APP:$TAG (rollback target: $APP:previous)"
