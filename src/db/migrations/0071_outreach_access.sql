-- Outreach (Prospecting with Newsletter inside) is now part of a salesman's day: anyone with a hand-picked app list
-- that has the CRM or Newsletters also gets Outreach. Lists left NULL follow the role defaults (sales now includes it).
-- Safe to run twice: people who already have it are skipped.
UPDATE "users" SET "apps" = array_append("apps", 'prospecting')
WHERE "apps" IS NOT NULL AND NOT ('prospecting' = ANY("apps")) AND ('crm' = ANY("apps") OR 'newsletter' = ANY("apps"));
