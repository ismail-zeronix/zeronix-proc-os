-- Phase 3 (SaaS): every tenant table carries organization_id, enforced by row-level security.
-- Existing rows belong to organisation 1 (Zeronix): the new columns take their default from app.org_id, set here.
SELECT set_config('app.org_id', '1', true);--> statement-breakpoint
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_absences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_punches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bill_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "company_owners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deal_assignees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deal_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "error_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_sent_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_mailboxes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_sequence_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outreach_suppression" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "parse_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "price_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_task_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "proposal_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "proposal_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospect_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospect_ai_models" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospect_ai_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospect_companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospect_people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospect_research_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospect_segments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospect_signals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospect_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quote_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_feeds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "supplier_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "terms_library" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "web_chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "web_chats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "advance_refunds" DROP CONSTRAINT "advance_refunds_number_unique";--> statement-breakpoint
ALTER TABLE "bills" DROP CONSTRAINT "bills_number_unique";--> statement-breakpoint
ALTER TABLE "credit_notes" DROP CONSTRAINT "credit_notes_number_unique";--> statement-breakpoint
ALTER TABLE "debit_notes" DROP CONSTRAINT "debit_notes_number_unique";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_number_unique";--> statement-breakpoint
ALTER TABLE "outreach_mailboxes" DROP CONSTRAINT "outreach_mailboxes_email_unique";--> statement-breakpoint
ALTER TABLE "outreach_suppression" DROP CONSTRAINT "outreach_suppression_value_unique";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_number_unique";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_match_key_unique";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_number_unique";--> statement-breakpoint
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_number_unique";--> statement-breakpoint
ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_number_unique";--> statement-breakpoint
ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_dn_number_unique";--> statement-breakpoint
ALTER TABLE "supplier_payments" DROP CONSTRAINT "supplier_payments_number_unique";--> statement-breakpoint
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_name_unique";--> statement-breakpoint
ALTER TABLE "project_task_templates" DROP CONSTRAINT "project_task_templates_type_key_project_types_key_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_type_key_project_types_key_fk";
--> statement-breakpoint
ALTER TABLE "proposal_templates" DROP CONSTRAINT "proposal_templates_type_key_project_types_key_fk";
--> statement-breakpoint
DROP INDEX "advance_refunds_year_seq_idx";--> statement-breakpoint
DROP INDEX "bills_year_seq_idx";--> statement-breakpoint
DROP INDEX "credit_notes_year_seq_idx";--> statement-breakpoint
DROP INDEX "debit_notes_year_seq_idx";--> statement-breakpoint
DROP INDEX "payments_year_seq_idx";--> statement-breakpoint
DROP INDEX "product_aliases_key_idx";--> statement-breakpoint
DROP INDEX "projects_year_seq_idx";--> statement-breakpoint
DROP INDEX "prospect_companies_domain_uq";--> statement-breakpoint
DROP INDEX "quotes_year_seq_idx";--> statement-breakpoint
DROP INDEX "sales_orders_year_seq_idx";--> statement-breakpoint
DROP INDEX "sales_orders_dn_year_seq_idx";--> statement-breakpoint
DROP INDEX "supplier_payments_year_seq_idx";--> statement-breakpoint
ALTER TABLE "accounting_settings" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "advance_refunds" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "bank_accounts" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "bill_items" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "bills" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint

ALTER TABLE "brand_profile" DROP CONSTRAINT "brand_profile_pkey";--> statement-breakpoint
ALTER TABLE "brand_profile" ALTER COLUMN "id" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "credit_note_items" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "credit_notes" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "dashboard_layouts" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "debit_note_items" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "debit_notes" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "doc_series" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "export_jobs" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "invoice_items" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "journal_entries" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "journal_lines" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "payment_allocations" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint

ALTER TABLE "project_types" DROP CONSTRAINT "project_types_pkey";--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "sales_orders" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint

ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "supplier_payments" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "tax_code_components" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "tax_codes" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "vat_returns" ALTER COLUMN "organization_id" SET DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_absences" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "organization_id" integer PRIMARY KEY DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_channels" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_members" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_prefs" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_reactions" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "company_owners" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "deal_assignees" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "deal_items" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "error_log" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_accounts" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_sent_log" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "enabled_apps" text[];--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "user_limit" integer;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_mailboxes" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_sequence_steps" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_suppression" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "parse_corrections" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "project_task_templates" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "project_types" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_snapshots" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal_templates" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_activities" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_ai_models" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_ai_providers" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_companies" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_people" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_research_runs" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_segments" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_signals" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_sources" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_feeds" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "terms_library" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "web_chat_messages" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "web_chats" ADD COLUMN "organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL;--> statement-breakpoint
ALTER TABLE "project_types" ADD CONSTRAINT "project_types_organization_id_key_pk" PRIMARY KEY("organization_id","key");--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_organization_id_key_pk" PRIMARY KEY("organization_id","key");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_absences" ADD CONSTRAINT "attendance_absences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD CONSTRAINT "brand_profile_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_prefs" ADD CONSTRAINT "chat_prefs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reactions" ADD CONSTRAINT "chat_reactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_owners" ADD CONSTRAINT "company_owners_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_assignees" ADD CONSTRAINT "deal_assignees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_items" ADD CONSTRAINT "deal_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_log" ADD CONSTRAINT "error_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_accounts" ADD CONSTRAINT "mail_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_sent_log" ADD CONSTRAINT "mail_sent_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD CONSTRAINT "outreach_enrollments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_mailboxes" ADD CONSTRAINT "outreach_mailboxes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequence_steps" ADD CONSTRAINT "outreach_sequence_steps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_suppression" ADD CONSTRAINT "outreach_suppression_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parse_corrections" ADD CONSTRAINT "parse_corrections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_templates" ADD CONSTRAINT "project_task_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_templates" ADD CONSTRAINT "project_task_templates_organization_id_type_key_project_types_organization_id_key_fk" FOREIGN KEY ("organization_id","type_key") REFERENCES "public"."project_types"("organization_id","key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_types" ADD CONSTRAINT "project_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_type_key_project_types_organization_id_key_fk" FOREIGN KEY ("organization_id","type_key") REFERENCES "public"."project_types"("organization_id","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_snapshots" ADD CONSTRAINT "proposal_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_templates" ADD CONSTRAINT "proposal_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_templates" ADD CONSTRAINT "proposal_templates_organization_id_type_key_project_types_organization_id_key_fk" FOREIGN KEY ("organization_id","type_key") REFERENCES "public"."project_types"("organization_id","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_activities" ADD CONSTRAINT "prospect_activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_ai_models" ADD CONSTRAINT "prospect_ai_models_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_ai_providers" ADD CONSTRAINT "prospect_ai_providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_companies" ADD CONSTRAINT "prospect_companies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_people" ADD CONSTRAINT "prospect_people_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_research_runs" ADD CONSTRAINT "prospect_research_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_segments" ADD CONSTRAINT "prospect_segments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_signals" ADD CONSTRAINT "prospect_signals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_sources" ADD CONSTRAINT "prospect_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_feeds" ADD CONSTRAINT "supplier_feeds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms_library" ADD CONSTRAINT "terms_library_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_chat_messages" ADD CONSTRAINT "web_chat_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_chats" ADD CONSTRAINT "web_chats_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advance_refunds_org_number_uq" ON "advance_refunds" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_org_number_uq" ON "bills" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_org_number_uq" ON "credit_notes" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "debit_notes_org_number_uq" ON "debit_notes" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_number_uq" ON "invoices" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_mailboxes_org_email_uq" ON "outreach_mailboxes" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_suppression_org_value_uq" ON "outreach_suppression" USING btree ("organization_id","value");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_org_number_uq" ON "payments" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_match_key_uq" ON "products" USING btree ("organization_id","match_key");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_number_uq" ON "projects" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_org_number_uq" ON "quotes" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_org_number_uq" ON "sales_orders" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_org_dn_number_uq" ON "sales_orders" USING btree ("organization_id","dn_number");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_payments_org_number_uq" ON "supplier_payments" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_org_name_uq" ON "suppliers" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "advance_refunds_year_seq_idx" ON "advance_refunds" USING btree ("organization_id","year","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_year_seq_idx" ON "bills" USING btree ("organization_id","year","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_year_seq_idx" ON "credit_notes" USING btree ("organization_id","year","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "debit_notes_year_seq_idx" ON "debit_notes" USING btree ("organization_id","year","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_year_seq_idx" ON "payments" USING btree ("organization_id","year","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "product_aliases_key_idx" ON "product_aliases" USING btree ("organization_id","match_key");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_year_seq_idx" ON "projects" USING btree ("organization_id","year","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "prospect_companies_domain_uq" ON "prospect_companies" USING btree ("organization_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_year_seq_idx" ON "quotes" USING btree ("organization_id","year","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_year_seq_idx" ON "sales_orders" USING btree ("organization_id","year","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_dn_year_seq_idx" ON "sales_orders" USING btree ("organization_id","dn_year","dn_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_payments_year_seq_idx" ON "supplier_payments" USING btree ("organization_id","year","seq");--> statement-breakpoint
CREATE POLICY "org_isolation" ON "activities" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "attendance_absences" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "attendance_punches" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "bill_items" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "bills" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "brand_profile" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "chat_channels" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "chat_members" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "chat_messages" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "chat_prefs" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "chat_reactions" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "companies" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "company_owners" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "contacts" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "credit_notes" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "deal_assignees" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "deal_items" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "deals" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "error_log" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id IS NULL OR organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "files" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "invoice_items" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "invoices" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "mail_accounts" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "mail_messages" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "mail_sent_log" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "notifications" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "offers" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_self" ON "organizations" AS PERMISSIVE FOR ALL TO public USING (id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "outreach_campaigns" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "outreach_enrollments" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "outreach_mailboxes" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "outreach_messages" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "outreach_sequence_steps" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "outreach_sequences" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "outreach_suppression" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "parse_corrections" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "payments" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "price_lists" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "product_aliases" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "products" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "project_task_templates" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "project_types" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "projects" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "proposal_snapshots" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "proposal_templates" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "proposals" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "prospect_activities" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "prospect_ai_models" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "prospect_ai_providers" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "prospect_companies" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "prospect_people" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "prospect_research_runs" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "prospect_segments" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "prospect_signals" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "prospect_sources" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "quote_items" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "quotes" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "sales_order_items" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "sales_orders" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "settings" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "supplier_feeds" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "supplier_payments" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "suppliers" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "tasks" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "terms_library" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "users" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "web_chat_messages" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "web_chats" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);
--> statement-breakpoint
-- every table with a policy enforces it even for its owner (superusers and BYPASSRLS roles still skip it)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;--> statement-breakpoint
-- sign-in: the email is global and the organisation is not known yet (the only read of users across organisations)
CREATE OR REPLACE FUNCTION app_login_user(p_email text)
RETURNS TABLE (id integer, organization_id integer, name text, email text, role text, password_hash text, is_active boolean, session_version integer, org_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT u.id, u.organization_id, u.name, u.email, u.role, u.password_hash, u.is_active, u.session_version, o.status = 'active'
  FROM users u JOIN organizations o ON o.id = u.organization_id
  WHERE u.email = p_email
  LIMIT 1
$fn$;--> statement-breakpoint
-- the worker: which organisations to run background jobs for
CREATE OR REPLACE FUNCTION app_active_org_ids()
RETURNS SETOF integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT id FROM organizations WHERE status = 'active' ORDER BY id
$fn$;
