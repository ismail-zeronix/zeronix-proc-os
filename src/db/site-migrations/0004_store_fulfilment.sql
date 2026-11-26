ALTER TABLE "site_orders" ADD COLUMN "delivery_fee" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_orders" ADD COLUMN "sales_order_id" integer;--> statement-breakpoint
ALTER TABLE "site_orders" ADD COLUMN "sales_order_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_orders" ADD COLUMN "tracking" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "site_orders" ADD COLUMN "sync_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_products" ADD COLUMN "availability" text DEFAULT 'in_stock' NOT NULL;