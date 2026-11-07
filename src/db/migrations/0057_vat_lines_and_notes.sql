CREATE TABLE "credit_note_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"credit_note_id" integer NOT NULL,
	"invoice_item_id" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"line_kind" text DEFAULT 'product' NOT NULL,
	"tax_code" text DEFAULT 'SR' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_note_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "debit_note_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"debit_note_id" integer NOT NULL,
	"bill_item_id" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"tax_code" text DEFAULT 'SR' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debit_note_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "debit_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	"number" text NOT NULL,
	"bill_id" integer NOT NULL,
	"issue_date" date NOT NULL,
	"reason" text NOT NULL,
	"supplier_ref" text DEFAULT '' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"vat_amount" numeric(14, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debit_notes_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "debit_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credit_notes" DROP CONSTRAINT "credit_notes_invoice_id_unique";--> statement-breakpoint
ALTER TABLE "bill_items" ADD COLUMN "tax_code" text DEFAULT 'SR' NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "credited_net" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "credited_total" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "goods_cost" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "tax_code" text DEFAULT 'SR' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "credited_net" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "credited_total" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_invoice_item_id_invoice_items_id_fk" FOREIGN KEY ("invoice_item_id") REFERENCES "public"."invoice_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD CONSTRAINT "debit_note_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD CONSTRAINT "debit_note_items_debit_note_id_debit_notes_id_fk" FOREIGN KEY ("debit_note_id") REFERENCES "public"."debit_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD CONSTRAINT "debit_note_items_bill_item_id_bill_items_id_fk" FOREIGN KEY ("bill_item_id") REFERENCES "public"."bill_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_note_items_note_idx" ON "credit_note_items" USING btree ("credit_note_id","position");--> statement-breakpoint
CREATE INDEX "credit_note_items_item_idx" ON "credit_note_items" USING btree ("invoice_item_id");--> statement-breakpoint
CREATE INDEX "debit_note_items_note_idx" ON "debit_note_items" USING btree ("debit_note_id","position");--> statement-breakpoint
CREATE INDEX "debit_note_items_item_idx" ON "debit_note_items" USING btree ("bill_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debit_notes_year_seq_idx" ON "debit_notes" USING btree ("year","seq");--> statement-breakpoint
CREATE INDEX "debit_notes_bill_idx" ON "debit_notes" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_idx" ON "credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE POLICY "org_isolation" ON "credit_note_items" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "debit_note_items" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "debit_notes" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
-- backfill: what existing documents mean under line tax codes
UPDATE "invoice_items" it SET "tax_code" = CASE WHEN i."vat_pct" > 0 THEN 'SR' ELSE 'ZR' END FROM "invoices" i WHERE i."id" = it."invoice_id";--> statement-breakpoint
UPDATE "bill_items" it SET "tax_code" = CASE WHEN b."vat_amount" > 0 THEN 'SR' ELSE 'OS' END FROM "bills" b WHERE b."id" = it."bill_id";--> statement-breakpoint
INSERT INTO "credit_note_items" ("organization_id", "credit_note_id", "invoice_item_id", "position", "description", "qty", "unit_price", "line_kind", "tax_code")
  SELECT c."organization_id", c."id", it."id", it."position", it."description", it."qty", it."unit_price", it."line_kind", it."tax_code"
  FROM "credit_notes" c JOIN "invoice_items" it ON it."invoice_id" = c."invoice_id";--> statement-breakpoint
UPDATE "invoices" i SET "credited_net" = c.net, "credited_total" = c.gross FROM (SELECT "invoice_id", sum("subtotal") net, sum("total") gross FROM "credit_notes" GROUP BY 1) c WHERE c."invoice_id" = i."id";
