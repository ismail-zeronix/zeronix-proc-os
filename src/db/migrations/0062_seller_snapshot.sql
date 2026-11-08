ALTER TABLE "invoices" ADD COLUMN "seller_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "seller_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "seller_snapshot" jsonb;