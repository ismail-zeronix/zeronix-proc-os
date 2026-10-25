ALTER TABLE "companies" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "accounts_level" text DEFAULT 'sales' NOT NULL;--> statement-breakpoint
-- Sales became CRM. People given Accounts before today were the accounts team (finance level); everyone with CRM also
-- gets Accounts, where quotes and orders now live (at the sales level unless set above).
UPDATE "users" SET "accounts_level" = 'finance' WHERE 'accounts' = ANY("apps");--> statement-breakpoint
UPDATE "users" SET "apps" = array_replace("apps", 'sales', 'crm') WHERE 'sales' = ANY("apps");--> statement-breakpoint
UPDATE "users" SET "apps" = array_append("apps", 'accounts') WHERE 'crm' = ANY("apps") AND NOT ('accounts' = ANY("apps"));
