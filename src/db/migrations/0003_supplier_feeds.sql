CREATE TABLE "supplier_feeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"url" text NOT NULL,
	"resolved_url" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"interval_minutes" integer DEFAULT 60 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone,
	"last_hash" text DEFAULT '' NOT NULL,
	"last_rows" integer DEFAULT 0 NOT NULL,
	"last_status" text DEFAULT 'never' NOT NULL,
	"last_message" text DEFAULT '' NOT NULL,
	"last_price_list_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_feeds_supplier_id_unique" UNIQUE("supplier_id")
);
--> statement-breakpoint
ALTER TABLE "supplier_feeds" ADD CONSTRAINT "supplier_feeds_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;