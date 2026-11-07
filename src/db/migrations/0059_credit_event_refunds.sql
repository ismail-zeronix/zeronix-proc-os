CREATE TABLE "advance_refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	"number" text NOT NULL,
	"party" text NOT NULL,
	"payment_id" integer,
	"supplier_payment_id" integer,
	"refunded_on" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" text NOT NULL,
	"bank_account_id" integer,
	"reference" text DEFAULT '' NOT NULL,
	"reason" text NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advance_refunds_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "advance_refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "event_date" date;--> statement-breakpoint
ALTER TABLE "advance_refunds" ADD CONSTRAINT "advance_refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_refunds" ADD CONSTRAINT "advance_refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_refunds" ADD CONSTRAINT "advance_refunds_supplier_payment_id_supplier_payments_id_fk" FOREIGN KEY ("supplier_payment_id") REFERENCES "public"."supplier_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_refunds" ADD CONSTRAINT "advance_refunds_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_refunds" ADD CONSTRAINT "advance_refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advance_refunds_year_seq_idx" ON "advance_refunds" USING btree ("year","seq");--> statement-breakpoint
CREATE INDEX "advance_refunds_payment_idx" ON "advance_refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "advance_refunds_supplier_payment_idx" ON "advance_refunds" USING btree ("supplier_payment_id");--> statement-breakpoint
CREATE POLICY "org_isolation" ON "advance_refunds" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);