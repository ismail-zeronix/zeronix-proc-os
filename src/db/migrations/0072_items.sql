CREATE TABLE "item_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'goods' NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"tax_code" text DEFAULT 'SR' NOT NULL,
	"track_stock" boolean DEFAULT false NOT NULL,
	"track_serials" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_id" integer,
	"brand" text DEFAULT '' NOT NULL,
	"part_number" text DEFAULT '' NOT NULL,
	"part_norm" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"kind" text DEFAULT 'goods' NOT NULL,
	"track_stock" boolean DEFAULT false NOT NULL,
	"track_serials" boolean DEFAULT false NOT NULL,
	"sale_price" numeric(14, 2),
	"purchase_price" numeric(14, 2),
	"tax_code" text DEFAULT 'SR' NOT NULL,
	"reorder_level" numeric(12, 2),
	"on_hand" numeric(12, 2) DEFAULT 0 NOT NULL,
	"stock_value" numeric(14, 2) DEFAULT 0 NOT NULL,
	"avg_cost" numeric(14, 4) DEFAULT 0 NOT NULL,
	"product_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_service_no_stock" CHECK ("items"."kind" = 'goods' OR ("items"."track_stock" = false AND "items"."track_serials" = false)),
	CONSTRAINT "items_serials_need_stock" CHECK ("items"."track_serials" = false OR "items"."track_stock" = true)
);
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounting_settings" ADD COLUMN "stock_start" date;--> statement-breakpoint
ALTER TABLE "accounting_settings" ADD COLUMN "negative_stock" text DEFAULT 'allow' NOT NULL;--> statement-breakpoint
ALTER TABLE "bill_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "deal_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "business_type" text;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_categories_name_uq" ON "item_categories" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "items_sku_uq" ON "items" USING btree ("organization_id",lower("sku"));--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("organization_id","category_id");--> statement-breakpoint
CREATE INDEX "items_part_norm_idx" ON "items" USING btree ("organization_id","part_norm");--> statement-breakpoint
CREATE INDEX "items_name_trgm" ON "items" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_items" ADD CONSTRAINT "deal_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD CONSTRAINT "debit_note_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_items_item_idx" ON "bill_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "invoice_items_item_idx" ON "invoice_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "sales_order_items_item_idx" ON "sales_order_items" USING btree ("item_id");--> statement-breakpoint
CREATE POLICY "org_isolation" ON "item_categories" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "items" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
-- Zeronix (organisation 1) trades goods: it gets items with stock and the Inventory app
UPDATE "organizations" SET "business_type" = 'trader' WHERE "id" = 1 AND "business_type" IS NULL;--> statement-breakpoint
-- people with their own app list who have Accounts also get Inventory (stock is part of the books)
UPDATE "users" SET "apps" = array_append("apps", 'inventory') WHERE "apps" IS NOT NULL AND 'accounts' = ANY("apps") AND NOT ('inventory' = ANY("apps"));
