#!/usr/bin/env bash
# Load the file made by production/prospects-export.sh into the PRODUCTION database, once:
#   /srv/docker/zeronix/production/prospects-import.sh prospects-data.sql you@zeronix.ae
#
# The email is the production user who will own the prospects (and be shown as the author of their history).
# Safe by design: it stops if production already has prospects, takes a backup first, and loads everything in one
# transaction, so it either all goes in or nothing does. Only prospect tables are written; links to CRM companies or
# deals are cleared (local ids mean nothing in production).
set -euo pipefail

FILE="${1:?usage: prospects-import.sh <prospects-data.sql> <owner email>}"
OWNER="${2:?usage: prospects-import.sh <prospects-data.sql> <owner email>}"
[ -s "$FILE" ] || { echo "$FILE is missing or empty" >&2; exit 1; }
grep -q 'CREATE SCHEMA px_export' "$FILE" || { echo "$FILE is not a prospects export" >&2; exit 1; }
FILE="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
COMPOSE=(docker compose -f "$ROOT/docker-compose.prod.yml")
sql() { "${COMPOSE[@]}" exec -T zeronix-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q -At "$@"' sh "$@"; }

case "$OWNER" in *"'"*) echo "bad email" >&2; exit 1 ;; esac
UID_="$(echo "SELECT id FROM users WHERE lower(email) = lower('$OWNER');" | sql)"
[ -n "$UID_" ] || { echo "no production user with email $OWNER" >&2; exit 1; }
HAVE="$(echo "SELECT to_regclass('public.prospect_companies') IS NOT NULL;" | sql)"
[ "$HAVE" = "t" ] || { echo "prospect tables are missing: deploy the Prospecting release first" >&2; exit 1; }
COUNT="$(echo "SELECT count(*) FROM prospect_companies;" | sql)"
[ "$COUNT" = "0" ] || { echo "production already has $COUNT prospects; not importing twice" >&2; exit 1; }

echo "taking a backup first"
"$ROOT/production/backup-postgres.sh"

echo "importing as user $UID_ ($OWNER)"
{
  echo "DROP SCHEMA IF EXISTS px_export CASCADE;"
  # \restrict lines (newer pg_dump) are not understood by an older psql and are not needed here
  grep -vE '^\\(un)?restrict ' "$FILE"
  cat <<SQL
SET search_path = public;
UPDATE px_export.prospect_companies c
   SET source_id = (SELECT s.id FROM public.prospect_sources s WHERE s.key = c.source_key),
       owner_id = $UID_, crm_company_id = NULL, crm_deal_id = NULL;
ALTER TABLE px_export.prospect_companies DROP COLUMN source_key;
UPDATE px_export.prospect_activities SET user_id = $UID_ WHERE user_id IS NOT NULL;
UPDATE px_export.prospect_signals SET created_by = $UID_ WHERE created_by IS NOT NULL;

-- copy by column name (not position), keeping ids so people, signals and history stay with their prospect
DO \$\$
DECLARE t text; cols text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prospect_companies','prospect_people','prospect_signals','prospect_activities'] LOOP
    SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) INTO cols
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t;
    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM px_export.%I', t, cols, cols, t);
    EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, ''id''), GREATEST((SELECT max(id) FROM public.%I), 1))', 'public.' || t, t);
  END LOOP;
END \$\$;

DROP SCHEMA px_export CASCADE;
SELECT (SELECT count(*) FROM prospect_companies) || ' prospects, ' ||
       (SELECT count(*) FROM prospect_people) || ' people, ' ||
       (SELECT count(*) FROM prospect_signals) || ' signals, ' ||
       (SELECT count(*) FROM prospect_activities) || ' activities now in production';
SQL
} | sql --single-transaction
echo "done. Next: Prospecting > Settings in production: add the sending mailbox, OpenRouter and Tavily keys again."
