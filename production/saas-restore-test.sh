#!/usr/bin/env bash
# Restore test: proves a backup reads back into a working database, and how long that takes. Run it monthly:
#   sudo bash /srv/docker/zeronix-saas/production/saas-restore-test.sh            the newest backup on this server
#   sudo bash /srv/docker/zeronix-saas/production/saas-restore-test.sh --offsite  the newest copy in Object Storage
#   sudo bash /srv/docker/zeronix-saas/production/saas-restore-test.sh <file.dump>
# It restores into a throwaway database (zxsaas_restore_test) inside zxsaas-postgres, counts the records of every
# organisation next to the live database (which is only read), and drops it again. The live data is never touched.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
TEST_DB=zxsaas_restore_test
env_value() { [ -f "$ROOT/.env.saas" ] && grep -E "^$1=" "$ROOT/.env.saas" | tail -n 1 | cut -d= -f2- || true; }
BACKUP_DIR="${BACKUP_DIR:-$(env_value BACKUP_DIR)}"; BACKUP_DIR="${BACKUP_DIR:-/srv/backups/zeronix-saas}"
. "$ROOT/production/saas-offsite.sh"

[ "$(docker inspect --format '{{.State.Running}}' zxsaas-postgres 2>/dev/null)" = "true" ] || { echo "zxsaas-postgres is not running" >&2; exit 1; }
psql_in() { docker exec -i zxsaas-postgres sh -c "psql -U \"\$POSTGRES_USER\" -d $1 -tA -F ' | ' -v ON_ERROR_STOP=1"; }
cleanup() { docker exec zxsaas-postgres sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists $TEST_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

SOURCE="${1:-}"
cleanup
docker exec zxsaas-postgres sh -c "createdb -U \"\$POSTGRES_USER\" $TEST_DB"
START=$(date +%s)
if [ "$SOURCE" = "--offsite" ]; then
  offsite_ready || { echo "OFFSITE_* is not set in .env.saas" >&2; exit 1; }
  NAME="$(offsite_latest 'zxsaas-db-*.dump.enc')"
  [ -n "$NAME" ] || { echo "no copy found in $OFFSITE_S3_BUCKET" >&2; exit 1; }
  echo "restoring the off-server copy $OFFSITE_S3_BUCKET/$NAME"
  offsite_cat "$NAME" | offsite_decrypt | docker exec -i zxsaas-postgres sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $TEST_DB --exit-on-error"
else
  FILE="${SOURCE:-$(ls -1t "$BACKUP_DIR"/zxsaas-db-*.dump 2>/dev/null | head -n 1 || true)}"
  [ -n "$FILE" ] && [ -f "$FILE" ] || { echo "no backup found in $BACKUP_DIR" >&2; exit 1; }
  echo "restoring $FILE ($(du -h "$FILE" | cut -f1))"
  docker exec -i zxsaas-postgres sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $TEST_DB --exit-on-error" < "$FILE"
fi
SECONDS_TAKEN=$(( $(date +%s) - START ))

COUNTS="SELECT o.id, o.name,
  (SELECT count(*) FROM users x WHERE x.organization_id = o.id) AS users,
  (SELECT count(*) FROM companies x WHERE x.organization_id = o.id) AS companies,
  (SELECT count(*) FROM deals x WHERE x.organization_id = o.id) AS deals,
  (SELECT count(*) FROM quotes x WHERE x.organization_id = o.id) AS quotes,
  (SELECT count(*) FROM invoices x WHERE x.organization_id = o.id) AS invoices,
  (SELECT count(*) FROM journal_entries x WHERE x.organization_id = o.id) AS journals,
  (SELECT count(*) FROM files x WHERE x.organization_id = o.id) AS files
FROM organizations o ORDER BY o.id;"
echo
echo "restored copy (id | name | users | customers | deals | quotes | invoices | ledger entries | files):"
echo "$COUNTS" | psql_in "$TEST_DB"
echo
echo "live database now (newer records since the backup are normal):"
LIVE_DB="$(docker exec zxsaas-postgres sh -c 'printf %s "$POSTGRES_DB"')"
echo "$COUNTS" | psql_in "$LIVE_DB"
echo
echo "migrations in the copy: $(echo 'SELECT count(*) FROM drizzle.__drizzle_migrations;' | psql_in "$TEST_DB")"
echo "RESTORE TEST OK: restored in ${SECONDS_TAKEN}s, the copy is dropped now."
