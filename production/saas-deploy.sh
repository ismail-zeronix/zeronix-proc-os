#!/usr/bin/env bash
# Deploy the SaaS install (demo.zeronixos.online) from the `saas` branch. It is its own checkout and its own stack:
#   /srv/docker/zeronix-saas/production/saas-deploy.sh
# Zeronix's own install (/srv/docker/zeronix-proc-os, docker-compose.prod.yml) is never touched by this script.
#
# Steps: pre-flight -> git pull --ff-only -> build zeronix-saas:<commit> -> keep the running image as zeronix-saas:previous
# -> start postgres -> back up the database (when it already has data) -> zxsaas-migrate (migrations, then the zx_app and
# zx_platform roles) -> start app and worker -> wait until healthy. Stops at the first failure; the running app keeps
# running until the last step. Never prunes images, containers or volumes.
#
#   SKIP_BACKUP=1   skip the pre-migration backup (not recommended)
#   BRANCH=saas     branch to deploy
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BRANCH="${BRANCH:-saas}"
ENV_FILE="$ROOT/.env.saas"
COMPOSE=(docker compose -f "$ROOT/docker-compose.saas.yml" --env-file "$ENV_FILE")
APP=zxsaas-app

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

log "Pre-flight checks"
[ -f "$ENV_FILE" ] || die "$ENV_FILE is missing: run production/saas-env.sh once to make it"
docker network inspect proxy-net >/dev/null 2>&1 || die "external network proxy-net not found (Caddy's network)"
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || die "checked-out branch is not $BRANCH"
git diff --quiet && git diff --cached --quiet || die "uncommitted changes in $ROOT; the server copy must stay clean"
"${COMPOSE[@]}" config --quiet || die "docker-compose.saas.yml or .env.saas is invalid"

log "Updating code from origin/$BRANCH"
git pull --ff-only origin "$BRANCH"
TAG="$(git rev-parse --short HEAD)"
echo "deploying commit $TAG"

log "Building image zeronix-saas:$TAG"
APP_IMAGE_TAG="$TAG" "${COMPOSE[@]}" build "$APP"

RUNNING_IMAGE="$(docker inspect --format '{{.Image}}' "$APP" 2>/dev/null || true)"
if [ -n "$RUNNING_IMAGE" ]; then
  docker tag "$RUNNING_IMAGE" zeronix-saas:previous
  echo "current image kept as zeronix-saas:previous"
fi
docker tag "zeronix-saas:$TAG" zeronix-saas:latest

log "Starting the database"
"${COMPOSE[@]}" up -d zxsaas-postgres
for _ in $(seq 1 30); do
  [ "$(docker inspect --format '{{.State.Health.Status}}' zxsaas-postgres 2>/dev/null)" = "healthy" ] && break
  sleep 2
done
[ "$(docker inspect --format '{{.State.Health.Status}}' zxsaas-postgres 2>/dev/null)" = "healthy" ] || die "zxsaas-postgres is not healthy"

HAS_DATA="$(echo "SELECT to_regclass('public.organizations') IS NOT NULL" | docker exec -i zxsaas-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA' 2>/dev/null || echo f)"
if [ "${SKIP_BACKUP:-0}" != "1" ] && [ "$HAS_DATA" = "t" ]; then
  log "Backing up the database before migrations"
  bash "$ROOT/production/saas-backup.sh" < /dev/null
fi

log "Migrations and database roles, then app and worker"
"${COMPOSE[@]}" up -d --no-build
docker wait zxsaas-migrate >/dev/null
[ "$(docker inspect --format '{{.State.ExitCode}}' zxsaas-migrate)" = "0" ] || { docker logs --tail 40 zxsaas-migrate >&2; die "migrations failed (the old app is still running)"; }

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
  die "app is $STATUS after deploy. Roll back with: $ROOT/production/saas-rollback.sh"
fi
docker exec "$APP" wget -qO- http://127.0.0.1:3000/api/health/db >/dev/null || die "app is up but cannot reach the database"

log "Deployed zeronix-saas:$TAG (rollback target: zeronix-saas:previous)"
