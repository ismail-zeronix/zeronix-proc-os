CREATE TABLE "vat_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"boxes" jsonb NOT NULL,
	"payable" numeric(14, 2) NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"previous_lock_date" date,
	"filed_by" integer,
	"filed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_on" date,
	"payment_reference" text DEFAULT '' NOT NULL,
	"bank_account_id" integer,
	"undone_at" timestamp with time zone,
	"undo_reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vat_returns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vat_returns" ADD CONSTRAINT "vat_returns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_returns" ADD CONSTRAINT "vat_returns_filed_by_users_id_fk" FOREIGN KEY ("filed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_returns" ADD CONSTRAINT "vat_returns_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vat_returns_period_uq" ON "vat_returns" USING btree ("organization_id","period_end") WHERE undone_at IS NULL;--> statement-breakpoint
CREATE POLICY "org_isolation" ON "vat_returns" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);