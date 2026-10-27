#!/usr/bin/env bash
# Back up the production database (and uploaded files) to a host folder. Safe to run any time, also from cron:
#   /srv/docker/zeronix/production/backup-postgres.sh
#
# Writes <BACKUP_DIR>/zeronix-db-YYYYMMDD-HHMMSS.dump  (pg_dump custom format, compressed, restore with pg_restore)
#        <BACKUP_DIR>/zeronix-files-YYYYMMDD-HHMMSS.tar.gz  (Files app uploads, when the app is running)
# The dump runs inside the postgres container over its local socket, so no password is passed or printed.
# A file only gets its final name after it was written completely and checked; old backups are removed only after a
# successful run, and only files matching the names above.
#
# Settings: environment variable, else the same key in .env, else the default.
#   BACKUP_DIR        /srv/backups/zeronix
#   BACKUP_KEEP_DAYS  14   (0 = keep everything)
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
COMPOSE=(docker compose -f "$ROOT/docker-compose.prod.yml")

# read one KEY=value from .env without executing the file
env_value() { [ -f "$ROOT/.env" ] && grep -E "^$1=" "$ROOT/.env" | tail -n 1 | cut -d= -f2- | tr -d '"'"'" || true; }

BACKUP_DIR="${BACKUP_DIR:-$(env_value BACKUP_DIR)}"; BACKUP_DIR="${BACKUP_DIR:-/srv/backups/zeronix}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-$(env_value BACKUP_KEEP_DAYS)}"; KEEP_DAYS="${KEEP_DAYS:-14}"
case "$KEEP_DAYS" in ''|*[!0-9]*) echo "BACKUP_KEEP_DAYS must be a number" >&2; exit 1 ;; esac

mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || { echo "another backup is running" >&2; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
DB_FILE="$BACKUP_DIR/zeronix-db-$STAMP.dump"
TMP="$DB_FILE.partial"
trap 'rm -f "$TMP" "$BACKUP_DIR"/zeronix-files-"$STAMP".tar.gz.partial' EXIT

[ "$(docker inspect --format '{{.State.Running}}' zeronix-postgres 2>/dev/null)" = "true" ] \
  || { echo "zeronix-postgres is not running" >&2; exit 1; }

echo "dumping database -> $DB_FILE"
"${COMPOSE[@]}" exec -T zeronix-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$TMP"
[ -s "$TMP" ] || { echo "dump is empty" >&2; exit 1; }
# check the archive can be read back before trusting it
"${COMPOSE[@]}" exec -T zeronix-postgres pg_restore --list < "$TMP" > /dev/null
mv "$TMP" "$DB_FILE"

if [ "$(docker inspect --format '{{.State.Running}}' zeronix-app 2>/dev/null)" = "true" ]; then
  FILES="$BACKUP_DIR/zeronix-files-$STAMP.tar.gz"
  echo "archiving uploaded files -> $FILES"
  "${COMPOSE[@]}" exec -T zeronix-app tar czf - -C /app/data/files . > "$FILES.partial"
  mv "$FILES.partial" "$FILES"
else
  echo "zeronix-app is not running, uploaded files skipped"
fi

if [ "$KEEP_DAYS" -gt 0 ]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'zeronix-db-*.dump' -o -name 'zeronix-files-*.tar.gz' \) \
    -mtime +"$KEEP_DAYS" -print -delete
fi
echo "backup complete"
