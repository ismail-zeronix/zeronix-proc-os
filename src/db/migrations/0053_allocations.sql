CREATE TABLE "payment_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"payment_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"applied_on" date NOT NULL,
	"voided_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplier_payment_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"payment_id" integer NOT NULL,
	"bill_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"applied_on" date NOT NULL,
	"voided_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_items" ALTER COLUMN "qty" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "invoice_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_payments" ALTER COLUMN "bill_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "invoice_id" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "is_customer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "line_kind" text DEFAULT 'product' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "quote_id" integer;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "paid_to" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_supplier_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."supplier_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "supplier_payment_allocations_payment_idx" ON "supplier_payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "supplier_payment_allocations_bill_idx" ON "supplier_payment_allocations" USING btree ("bill_id");--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bills_invoice_idx" ON "bills" USING btree ("invoice_id");--> statement-breakpoint
CREATE POLICY "org_isolation" ON "payment_allocations" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "supplier_payment_allocations" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
-- every existing payment paid one document: keep that as its one allocation, on the same date and with the same void state
INSERT INTO "payment_allocations" ("organization_id", "payment_id", "invoice_id", "amount", "applied_on", "voided_at", "created_by", "created_at")
  SELECT "organization_id", "id", "invoice_id", "amount", "paid_on", "voided_at", "created_by", "created_at" FROM "payments" WHERE "invoice_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "supplier_payment_allocations" ("organization_id", "payment_id", "bill_id", "amount", "applied_on", "voided_at", "created_by", "created_at")
  SELECT "organization_id", "id", "bill_id", "amount", "paid_on", "voided_at", "created_by", "created_at" FROM "supplier_payments" WHERE "bill_id" IS NOT NULL;--> statement-breakpoint
-- who an expense's voucher went to, when there is no supplier record
UPDATE "supplier_payments" sp SET "paid_to" = b."paid_to" FROM "bills" b WHERE b."id" = sp."bill_id" AND sp."supplier_id" IS NULL;--> statement-breakpoint
-- invoices of project deals earned service income, so their lines are services
UPDATE "invoice_items" ii SET "line_kind" = 'service' FROM "invoices" i JOIN "deals" d ON d."id" = i."deal_id" WHERE ii."invoice_id" = i."id" AND d."kind" = 'project';
