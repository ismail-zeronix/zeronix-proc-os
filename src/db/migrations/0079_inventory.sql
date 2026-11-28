-- Items and Inventory (dev 0072_items, 0073_inventory_stock, 0074_industry) for the SaaS install: generated from the
-- schema, so the new tables take the signed-in organisation and carry org_isolation. No data changes: each organisation
-- picks its business type and industry itself (Admin > Settings > Company).

CREATE TABLE "item_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL,
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
ALTER TABLE "item_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL,
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
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_adjustment_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL,
	"adjustment_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"counted_qty" numeric(12, 2),
	"unit_cost" numeric(14, 4),
	"serials" text[] DEFAULT '{}'::text[] NOT NULL
);
ALTER TABLE "stock_adjustment_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL,
	"number" text NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"offset" text DEFAULT 'stock_adjustments' NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"total_value" numeric(14, 2) DEFAULT 0 NOT NULL,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "stock_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_move_serials" (
	"organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL,
	"move_id" integer NOT NULL,
	"serial_id" integer NOT NULL,
	CONSTRAINT "stock_move_serials_move_id_serial_id_pk" PRIMARY KEY("move_id","serial_id")
);
ALTER TABLE "stock_move_serials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL,
	"item_id" integer NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"qty" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(14, 4) DEFAULT 0 NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer NOT NULL,
	"source_line_id" integer,
	"entry_id" integer,
	"uncosted_qty" numeric(12, 2) DEFAULT 0 NOT NULL,
	"settles_move_id" integer,
	"return_of_move_id" integer,
	"qty_after" numeric(12, 2) NOT NULL,
	"value_after" numeric(14, 2) NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "stock_moves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_serials" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL,
	"item_id" integer NOT NULL,
	"serial" text NOT NULL,
	"serial_norm" text NOT NULL,
	"status" text NOT NULL,
	"received_move_id" integer,
	"last_move_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "stock_serials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounting_settings" ADD COLUMN "stock_start" date;--> statement-breakpoint
ALTER TABLE "accounting_settings" ADD COLUMN "negative_stock" text DEFAULT 'allow' NOT NULL;--> statement-breakpoint
ALTER TABLE "bill_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "bill_items" ADD COLUMN "serials" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD COLUMN "qty_back" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD COLUMN "serials" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "deal_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "debit_note_items" ADD COLUMN "serials" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD COLUMN "goods_back" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "serials" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "business_type" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "item_id" integer;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD COLUMN "serials" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_adjustment_id_stock_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."stock_adjustments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move_serials" ADD CONSTRAINT "stock_move_serials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move_serials" ADD CONSTRAINT "stock_move_serials_move_id_stock_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."stock_moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_move_serials" ADD CONSTRAINT "stock_move_serials_serial_id_stock_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."stock_serials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_settles_move_id_stock_moves_id_fk" FOREIGN KEY ("settles_move_id") REFERENCES "public"."stock_moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_return_of_move_id_stock_moves_id_fk" FOREIGN KEY ("return_of_move_id") REFERENCES "public"."stock_moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_serials" ADD CONSTRAINT "stock_serials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_serials" ADD CONSTRAINT "stock_serials_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_serials" ADD CONSTRAINT "stock_serials_received_move_id_stock_moves_id_fk" FOREIGN KEY ("received_move_id") REFERENCES "public"."stock_moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_serials" ADD CONSTRAINT "stock_serials_last_move_id_stock_moves_id_fk" FOREIGN KEY ("last_move_id") REFERENCES "public"."stock_moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_categories_name_uq" ON "item_categories" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "items_sku_uq" ON "items" USING btree ("organization_id",lower("sku"));--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("organization_id","category_id");--> statement-breakpoint
CREATE INDEX "items_part_norm_idx" ON "items" USING btree ("organization_id","part_norm");--> statement-breakpoint
CREATE INDEX "items_name_trgm" ON "items" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "stock_adjustment_lines_adj_idx" ON "stock_adjustment_lines" USING btree ("adjustment_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_adjustments_number_uq" ON "stock_adjustments" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "stock_move_serials_serial_idx" ON "stock_move_serials" USING btree ("serial_id");--> statement-breakpoint
CREATE INDEX "stock_moves_item_idx" ON "stock_moves" USING btree ("organization_id","item_id","id");--> statement-breakpoint
CREATE INDEX "stock_moves_source_idx" ON "stock_moves" USING btree ("organization_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "stock_moves_date_idx" ON "stock_moves" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "stock_moves_uncosted_idx" ON "stock_moves" USING btree ("organization_id","item_id") WHERE "stock_moves"."uncosted_qty" > 0;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_moves_line_uq" ON "stock_moves" USING btree ("organization_id","source_type","source_id","source_line_id","kind") WHERE "stock_moves"."source_line_id" IS NOT NULL AND "stock_moves"."kind" NOT IN ('settle', 'void');--> statement-breakpoint
CREATE UNIQUE INDEX "stock_serials_uq" ON "stock_serials" USING btree ("organization_id","item_id","serial_norm");--> statement-breakpoint
CREATE INDEX "stock_serials_norm_idx" ON "stock_serials" USING btree ("organization_id","serial_norm");--> statement-breakpoint
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
CREATE POLICY "org_isolation" ON "stock_adjustment_lines" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "stock_adjustments" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "stock_move_serials" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "stock_moves" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "stock_serials" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
-- items and stock (dev 0072-0074): every new table enforces its policy for the owner too, as after 0064_tenancy
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
