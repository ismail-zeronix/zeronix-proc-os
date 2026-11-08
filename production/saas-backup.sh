#!/usr/bin/env bash
# Back up the SaaS database and uploaded files. Safe any time, also from cron:
#   /srv/docker/zeronix-saas/production/saas-backup.sh
# Writes <BACKUP_DIR>/zxsaas-db-YYYYMMDD-HHMMSS.dump (pg_dump custom format) and zxsaas-files-*.tar.gz. The dump runs
# inside the postgres container as its owner, so no password is passed or printed. Old backups are removed only after
# a successful run. A copy off this server is strongly recommended (the server failing takes these with it).
#   BACKUP_DIR        /srv/backups/zeronix-saas   (or BACKUP_DIR in .env.saas)
#   BACKUP_KEEP_DAYS  14
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
env_value() { [ -f "$ROOT/.env.saas" ] && grep -E "^$1=" "$ROOT/.env.saas" | tail -n 1 | cut -d= -f2- || true; }
BACKUP_DIR="${BACKUP_DIR:-$(env_value BACKUP_DIR)}"; BACKUP_DIR="${BACKUP_DIR:-/srv/backups/zeronix-saas}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-$(env_value BACKUP_KEEP_DAYS)}"; KEEP_DAYS="${KEEP_DAYS:-14}"
case "$KEEP_DAYS" in ''|*[!0-9]*) echo "BACKUP_KEEP_DAYS must be a number" >&2; exit 1 ;; esac

mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || { echo "another backup is running" >&2; exit 1; }
STAMP="$(date +%Y%m%d-%H%M%S)"
DB_FILE="$BACKUP_DIR/zxsaas-db-$STAMP.dump"
trap 'rm -f "$BACKUP_DIR"/zxsaas-*-"$STAMP".*.partial' EXIT

[ "$(docker inspect --format '{{.State.Running}}' zxsaas-postgres 2>/dev/null)" = "true" ] || { echo "zxsaas-postgres is not running" >&2; exit 1; }
docker exec zxsaas-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DB_FILE.partial"
docker exec -i zxsaas-postgres pg_restore --list < "$DB_FILE.partial" >/dev/null || { echo "the dump does not read back" >&2; exit 1; }
mv "$DB_FILE.partial" "$DB_FILE"
echo "database: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"

if [ "$(docker inspect --format '{{.State.Running}}' zxsaas-app 2>/dev/null)" = "true" ]; then
  FILES="$BACKUP_DIR/zxsaas-files-$STAMP.tar.gz"
  docker exec zxsaas-app tar -czf - -C /app/data files > "$FILES.partial"
  mv "$FILES.partial" "$FILES"
  echo "files: $FILES ($(du -h "$FILES" | cut -f1))"
fi

if [ "$KEEP_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'zxsaas-db-*.dump' -o -name 'zxsaas-files-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
fi
