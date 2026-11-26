-- Tenancy catch-up (saas branch): the tables dev added after 0064_tenancy (newsletter, Claude connector, payroll,
-- WhatsApp stock intake, sales routine) were made with organization_id DEFAULT 1, the single-company default. Here they
-- take the signed-in organisation instead, like every other table, and enforce their policy for the owner too.
-- Safe to run twice; nothing else changes.
ALTER TABLE "newsletter_lists" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "newsletter_contacts" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "newsletter_campaigns" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "newsletter_sends" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "mcp_clients" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "mcp_grants" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "employee_pay" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "pay_item_types" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "payslips" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "payslip_lines" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "employee_advances" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "supplier_handles" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "stock_inbox" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "daily_reports" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "check_ins" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
-- every table with a policy enforces it even for its owner (as at the end of 0064_tenancy)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
