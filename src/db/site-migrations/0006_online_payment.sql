ALTER TABLE "site_orders" ADD COLUMN "payment_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_orders" ADD COLUMN "paid_at" timestamp with time zone;