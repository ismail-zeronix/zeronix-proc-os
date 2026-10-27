CREATE TABLE "bill_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"bill_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"qty" numeric(12, 2) DEFAULT 1 NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	"number" text NOT NULL,
	"kind" text DEFAULT 'bill' NOT NULL,
	"supplier_id" integer,
	"paid_to" text DEFAULT '' NOT NULL,
	"supplier_ref" text DEFAULT '' NOT NULL,
	"bill_date" date NOT NULL,
	"terms_days" integer DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"category" text NOT NULL,
	"order_id" integer,
	"deal_id" integer,
	"vat_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"vat_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"void_reason" text DEFAULT '' NOT NULL,
	"voided_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	"number" text NOT NULL,
	"bill_id" integer NOT NULL,
	"supplier_id" integer,
	"paid_on" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payments_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "trn" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "terms_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "bank_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "iban" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_items_bill_idx" ON "bill_items" USING btree ("bill_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_year_seq_idx" ON "bills" USING btree ("year","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_supplier_ref_idx" ON "bills" USING btree ("supplier_id","supplier_ref") WHERE supplier_ref <> '' AND status <> 'void';--> statement-breakpoint
CREATE INDEX "bills_supplier_idx" ON "bills" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "bills_due_idx" ON "bills" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "bills_order_idx" ON "bills" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "bills_date_idx" ON "bills" USING btree ("bill_date");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_payments_year_seq_idx" ON "supplier_payments" USING btree ("year","seq");--> statement-breakpoint
CREATE INDEX "supplier_payments_bill_idx" ON "supplier_payments" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_idx" ON "supplier_payments" USING btree ("supplier_id");