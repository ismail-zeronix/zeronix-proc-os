CREATE TABLE "site_authors" (
	"id" serial PRIMARY KEY NOT NULL,
	"portal_user_id" integer,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"photo" jsonb,
	"links" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_authors_portal_user_id_unique" UNIQUE("portal_user_id"),
	CONSTRAINT "site_authors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site_brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"logo_file_id" integer,
	"website" text DEFAULT '' NOT NULL,
	"uae_warranty_note" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	CONSTRAINT "site_brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"icon" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image" jsonb,
	"spec_template" jsonb DEFAULT '{"groups":[]}'::jsonb NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site_daily" (
	"day" date NOT NULL,
	"path" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"metric" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "site_daily_day_path_source_metric_pk" PRIMARY KEY("day","path","source","metric")
);
--> statement-breakpoint
CREATE TABLE "site_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"post_id" integer,
	"product_id" integer,
	"industry_id" integer,
	"visitor_key" text DEFAULT '' NOT NULL,
	"session_key" text DEFAULT '' NOT NULL,
	"referrer" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"utm" jsonb,
	"country" text DEFAULT '' NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"value" integer
);
--> statement-breakpoint
CREATE TABLE "site_industries" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"hero_title" text DEFAULT '' NOT NULL,
	"image" jsonb,
	"intro" text DEFAULT '' NOT NULL,
	"intro_html" text DEFAULT '' NOT NULL,
	"pain_points" text[] DEFAULT '{}'::text[] NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_industries_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword" text NOT NULL,
	"cluster" text DEFAULT '' NOT NULL,
	"intent" text DEFAULT 'commercial' NOT NULL,
	"industry_id" integer,
	"category_id" integer,
	"priority" integer DEFAULT 2 NOT NULL,
	"volume" integer,
	"difficulty" integer,
	"source" text DEFAULT 'research' NOT NULL,
	"target_post_id" integer,
	"target_path" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'idea' NOT NULL,
	"planned_for" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stored_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_post_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'article' NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"meta_title" text DEFAULT '' NOT NULL,
	"meta_description" text DEFAULT '' NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"primary_keyword" text DEFAULT '' NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"industry_id" integer,
	"category_id" integer,
	"products" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schema" jsonb,
	"cover" jsonb,
	"cta_text" text DEFAULT '' NOT NULL,
	"seo_checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_file_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"author_user_id" integer,
	"published_by" integer,
	"review_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site_product_links" (
	"product_id" integer NOT NULL,
	"industry_id" integer NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "site_product_links_product_id_industry_id_role_pk" PRIMARY KEY("product_id","industry_id","role")
);
--> statement-breakpoint
CREATE TABLE "site_product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"mpn" text DEFAULT '' NOT NULL,
	"label" text NOT NULL,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"list_price" numeric(12, 2),
	"portal_product_id" integer,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"category_id" integer,
	"brand_id" integer,
	"name" text NOT NULL,
	"series" text DEFAULT '' NOT NULL,
	"mpn" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"summary_html" text DEFAULT '' NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"highlights" text[] DEFAULT '{}'::text[] NOT NULL,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uae_available" boolean DEFAULT true NOT NULL,
	"uae_notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"specs_checked_at" timestamp with time zone,
	"pros" text[] DEFAULT '{}'::text[] NOT NULL,
	"cons" text[] DEFAULT '{}'::text[] NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"portal_product_id" integer,
	"price_mode" text DEFAULT 'on_request' NOT NULL,
	"list_price" numeric(12, 2),
	"currency" text DEFAULT 'AED' NOT NULL,
	"vat_included" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site_quote_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"site" text DEFAULT '' NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_page" text DEFAULT '' NOT NULL,
	"cta" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"users" integer,
	"budget" text DEFAULT '' NOT NULL,
	"timeline" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visitor_key" text DEFAULT '' NOT NULL,
	"landing_path" text DEFAULT '' NOT NULL,
	"first_referrer" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"deal_id" integer,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_search_daily" (
	"day" date NOT NULL,
	"page" text NOT NULL,
	"query" text NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"position" real DEFAULT 0 NOT NULL,
	CONSTRAINT "site_search_daily_day_page_query_country_device_pk" PRIMARY KEY("day","page","query","country","device")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_brands" ADD CONSTRAINT "site_brands_logo_file_id_site_media_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."site_media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_keywords" ADD CONSTRAINT "site_keywords_industry_id_site_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."site_industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_keywords" ADD CONSTRAINT "site_keywords_category_id_site_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."site_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_keywords" ADD CONSTRAINT "site_keywords_target_post_id_site_posts_id_fk" FOREIGN KEY ("target_post_id") REFERENCES "public"."site_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_post_revisions" ADD CONSTRAINT "site_post_revisions_post_id_site_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."site_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_posts" ADD CONSTRAINT "site_posts_industry_id_site_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."site_industries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_posts" ADD CONSTRAINT "site_posts_category_id_site_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."site_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_product_links" ADD CONSTRAINT "site_product_links_product_id_site_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."site_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_product_links" ADD CONSTRAINT "site_product_links_industry_id_site_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."site_industries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_product_variants" ADD CONSTRAINT "site_product_variants_product_id_site_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."site_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_products" ADD CONSTRAINT "site_products_category_id_site_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."site_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_products" ADD CONSTRAINT "site_products_brand_id_site_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."site_brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_daily_metric_idx" ON "site_daily" USING btree ("metric","day");--> statement-breakpoint
CREATE INDEX "site_events_at_idx" ON "site_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "site_events_post_idx" ON "site_events" USING btree ("post_id","at");--> statement-breakpoint
CREATE INDEX "site_events_type_idx" ON "site_events" USING btree ("type","at");--> statement-breakpoint
CREATE INDEX "site_events_session_idx" ON "site_events" USING btree ("session_key","at");--> statement-breakpoint
CREATE UNIQUE INDEX "site_keywords_keyword_uq" ON "site_keywords" USING btree (lower("keyword"));--> statement-breakpoint
CREATE INDEX "site_keywords_cluster_idx" ON "site_keywords" USING btree ("cluster");--> statement-breakpoint
CREATE INDEX "site_keywords_status_idx" ON "site_keywords" USING btree ("status","planned_for");--> statement-breakpoint
CREATE INDEX "site_post_revisions_post_idx" ON "site_post_revisions" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "site_posts_status_idx" ON "site_posts" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "site_posts_industry_idx" ON "site_posts" USING btree ("industry_id");--> statement-breakpoint
CREATE INDEX "site_posts_type_idx" ON "site_posts" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "site_product_links_industry_idx" ON "site_product_links" USING btree ("industry_id","rank");--> statement-breakpoint
CREATE INDEX "site_products_category_idx" ON "site_products" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "site_products_brand_idx" ON "site_products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "site_products_mpn_idx" ON "site_products" USING btree ("mpn");--> statement-breakpoint
CREATE INDEX "site_quote_requests_created_idx" ON "site_quote_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "site_search_daily_page_idx" ON "site_search_daily" USING btree ("page","day");--> statement-breakpoint
CREATE INDEX "site_search_daily_query_idx" ON "site_search_daily" USING btree ("query","day");