#!/usr/bin/env bash
# Export the Prospecting data from the LOCAL (dev) database so it can be loaded into production once:
#   production/prospects-export.sh [out-file]        (default: prospects-data.sql in the repo root)
#
# Copies prospects, their people, signals and activity history. It leaves out mailboxes and AI providers (their
# passwords and keys are encrypted with the local AUTH_SECRET and would not open in production; enter them again in
# production's Prospecting settings), campaigns/enrollments (local tests) and research run history.
# The rows go into a separate schema "px_export" in the file; production/prospects-import.sh moves them into place.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="${1:-prospects-data.sql}"
COMPOSE=(docker compose -f docker-compose.yml)

# run SQL from stdin against the local database
sql() { "${COMPOSE[@]}" exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q -At'; }
trap 'echo "DROP SCHEMA IF EXISTS px_export CASCADE;" | sql; rm -f "$OUT.partial"' EXIT

sql <<'SQL'
DROP SCHEMA IF EXISTS px_export CASCADE;
CREATE SCHEMA px_export;
-- sources by key: production has the same seeded sources, maybe with other ids
CREATE TABLE px_export.prospect_companies AS
  SELECT c.*, s.key AS source_key FROM prospect_companies c LEFT JOIN prospect_sources s ON s.id = c.source_id;
CREATE TABLE px_export.prospect_people AS SELECT * FROM prospect_people;
CREATE TABLE px_export.prospect_signals AS SELECT * FROM prospect_signals;
CREATE TABLE px_export.prospect_activities AS SELECT * FROM prospect_activities;
SQL

"${COMPOSE[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -n px_export --no-owner --no-privileges' > "$OUT.partial"
[ -s "$OUT.partial" ] || { echo "export is empty" >&2; exit 1; }
mv "$OUT.partial" "$OUT"

sql <<'SQL'
SELECT (SELECT count(*) FROM px_export.prospect_companies) || ' prospects, ' ||
       (SELECT count(*) FROM px_export.prospect_people) || ' people, ' ||
       (SELECT count(*) FROM px_export.prospect_signals) || ' signals, ' ||
       (SELECT count(*) FROM px_export.prospect_activities) || ' activities exported';
SQL
echo "written $OUT ($(du -h "$OUT" | cut -f1)). Copy it to the server, for example:"
echo "  scp $OUT <user>@57.131.160.147:/srv/docker/zeronix-proc-os/"
