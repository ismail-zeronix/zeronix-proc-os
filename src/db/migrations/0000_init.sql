CREATE TABLE "offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"price_list_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"category" text NOT NULL,
	"brand" text NOT NULL,
	"model_name" text NOT NULL,
	"part_number" text DEFAULT '' NOT NULL,
	"cpu" text DEFAULT '' NOT NULL,
	"ram_gb" integer,
	"storage" text DEFAULT '' NOT NULL,
	"display" text DEFAULT '' NOT NULL,
	"gpu" text DEFAULT '' NOT NULL,
	"os" text DEFAULT '' NOT NULL,
	"extras" text DEFAULT '' NOT NULL,
	"condition" text DEFAULT 'new' NOT NULL,
	"price" numeric(12, 2),
	"currency" text DEFAULT 'AED' NOT NULL,
	"stock_note" text DEFAULT '' NOT NULL,
	"raw_text" text DEFAULT '' NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"search_norm" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parse_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"input" text NOT NULL,
	"output" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_text" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress_done" integer DEFAULT 0 NOT NULL,
	"progress_total" integer DEFAULT 0 NOT NULL,
	"error" text,
	"model" text,
	"parse_ms" integer,
	"drafts" jsonb,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"match_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"brand" text NOT NULL,
	"model_name" text NOT NULL,
	"part_number" text DEFAULT '' NOT NULL,
	"part_norm" text DEFAULT '' NOT NULL,
	"cpu" text DEFAULT '' NOT NULL,
	"ram_gb" integer,
	"storage" text DEFAULT '' NOT NULL,
	"spec_summary" text DEFAULT '' NOT NULL,
	"match_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_match_key_unique" UNIQUE("match_key")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'sales' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parse_corrections" ADD CONSTRAINT "parse_corrections_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offers_product_idx" ON "offers" USING btree ("product_id","received_at");--> statement-breakpoint
CREATE INDEX "offers_supplier_idx" ON "offers" USING btree ("supplier_id","received_at");--> statement-breakpoint
CREATE INDEX "offers_search_trgm" ON "offers" USING gin ("search_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "parse_corrections_supplier_idx" ON "parse_corrections" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "price_lists_supplier_idx" ON "price_lists" USING btree ("supplier_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_aliases_key_idx" ON "product_aliases" USING btree ("match_key");--> statement-breakpoint
CREATE INDEX "products_part_norm_idx" ON "products" USING btree ("brand","part_norm");--> statement-breakpoint
CREATE INDEX "products_model_trgm" ON "products" USING gin ("model_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_part_trgm" ON "products" USING gin ("part_number" gin_trgm_ops);