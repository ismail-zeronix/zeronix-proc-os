ALTER TABLE "organizations" ADD COLUMN "plan" text DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_ends_on" date;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "paid_until" date;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "price_monthly" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "paused_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_reminder" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- organisation 1 is Zeronix's own: never billed. Every other existing organisation stays an open trial (no end date)
-- until the platform console sets one.
UPDATE "organizations" SET "plan" = 'free' WHERE "id" = 1;--> statement-breakpoint
-- the billing job emails the platform admins about unpaid organisations; the app's role cannot read platform_admins,
-- so this hands it their addresses only
CREATE OR REPLACE FUNCTION app_platform_notify_emails()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT email FROM platform_admins WHERE is_active ORDER BY id
$fn$;