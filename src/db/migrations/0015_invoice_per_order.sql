ALTER TABLE "invoices" DROP CONSTRAINT "invoices_order_id_unique";--> statement-breakpoint
CREATE INDEX "invoices_order_idx" ON "invoices" USING btree ("order_id");