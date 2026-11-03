CREATE TABLE "site_picture_queue" (
	"product_id" integer PRIMARY KEY NOT NULL,
	"page_url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"pictures" integer DEFAULT 0 NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_picture_queue" ADD CONSTRAINT "site_picture_queue_product_id_site_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."site_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_picture_queue_status_idx" ON "site_picture_queue" USING btree ("status","updated_at");