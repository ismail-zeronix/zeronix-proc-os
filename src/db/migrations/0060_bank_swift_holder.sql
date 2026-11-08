ALTER TABLE "bank_accounts" ADD COLUMN "swift" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "holder_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Invoices now print the default bank account. Copy the old printed bank details (settings bank_*) into its empty
-- fields once; nothing is overwritten and the old settings stay as they were.
UPDATE "bank_accounts" b SET
	"bank_name" = CASE WHEN b."bank_name" = '' THEN coalesce((SELECT "value" FROM "settings" WHERE "key" = 'bank_name'), '') ELSE b."bank_name" END,
	"account_number" = CASE WHEN b."account_number" = '' THEN coalesce((SELECT "value" FROM "settings" WHERE "key" = 'bank_account_number'), '') ELSE b."account_number" END,
	"iban" = CASE WHEN b."iban" = '' THEN coalesce((SELECT "value" FROM "settings" WHERE "key" = 'bank_iban'), '') ELSE b."iban" END,
	"swift" = coalesce((SELECT "value" FROM "settings" WHERE "key" = 'bank_swift'), ''),
	"holder_name" = coalesce((SELECT "value" FROM "settings" WHERE "key" = 'bank_account_name'), '')
WHERE b."id" = (SELECT "id" FROM "bank_accounts" WHERE "kind" = 'bank' AND "is_active" AND "is_default" ORDER BY "id" LIMIT 1);
