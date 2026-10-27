-- Sales split from Accounts: Accounts at the "sales" level becomes the Sales app; the accounts team keeps Accounts and also gets Sales.
UPDATE "users" SET "apps" = array_replace("apps", 'accounts', 'sales') WHERE 'accounts' = ANY("apps") AND "accounts_level" = 'sales';--> statement-breakpoint
UPDATE "users" SET "apps" = array_append("apps", 'sales') WHERE 'accounts' = ANY("apps") AND NOT ('sales' = ANY("apps"));--> statement-breakpoint
UPDATE "users" SET "apps" = array_append("apps", 'sales') WHERE 'crm' = ANY("apps") AND NOT ('sales' = ANY("apps"));--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "accounts_level";