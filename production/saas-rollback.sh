#!/usr/bin/env bash
# Puts the previous SaaS build back (zeronix-saas:previous, or a commit tag given as the argument):
#   /srv/docker/zeronix-saas/production/saas-rollback.sh [tag]
# Migrations are not undone: they only ever add, so the older build runs on the newer database.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
TARGET="${1:-previous}"
COMPOSE=(docker compose -f "$ROOT/docker-compose.saas.yml" --env-file "$ROOT/.env.saas")
docker image inspect "zeronix-saas:$TARGET" >/dev/null 2>&1 || { echo "image zeronix-saas:$TARGET not found" >&2; exit 1; }
echo "switching to zeronix-saas:$TARGET"
docker tag "zeronix-saas:$TARGET" zeronix-saas:latest
"${COMPOSE[@]}" up -d --no-build --no-deps zxsaas-app zxsaas-worker
for _ in $(seq 1 40); do
  STATUS="$(docker inspect --format '{{.State.Health.Status}}' zxsaas-app 2>/dev/null || echo missing)"
  [ "$STATUS" = "healthy" ] && break
  sleep 3
done
echo "zxsaas-app is $STATUS"
