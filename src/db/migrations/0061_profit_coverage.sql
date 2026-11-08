ALTER TABLE "sales_orders" DROP CONSTRAINT "sales_orders_quote_id_unique";--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "sold_with_cost" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "uncosted_lines" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "sold_with_cost" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "uncosted_lines" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_live_order_idx" ON "invoices" USING btree ("order_id") WHERE status <> 'cancelled' AND order_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_live_quote_idx" ON "invoices" USING btree ("quote_id") WHERE status <> 'cancelled' AND quote_id IS NOT NULL AND order_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_live_quote_idx" ON "sales_orders" USING btree ("quote_id") WHERE status <> 'cancelled';--> statement-breakpoint
CREATE INDEX "sales_orders_quote_idx" ON "sales_orders" USING btree ("quote_id");--> statement-breakpoint
-- what the costed lines sell for, and how many lines have no cost, from the saved lines (H1: profit = sold with cost - cost)
UPDATE "quotes" q SET
  "sold_with_cost" = s.sold,
  "uncosted_lines" = s.uncosted
FROM (
  SELECT quote_id,
    CASE WHEN count(*) FILTER (WHERE cost_aed IS NOT NULL) > 0 THEN sum(round(qty * unit_price, 2)) FILTER (WHERE cost_aed IS NOT NULL) END AS sold,
    count(*) FILTER (WHERE cost_aed IS NULL)::int AS uncosted
  FROM "quote_items" GROUP BY quote_id
) s WHERE s.quote_id = q.id;--> statement-breakpoint
UPDATE "sales_orders" o SET "sold_with_cost" = q.sold_with_cost, "uncosted_lines" = q.uncosted_lines FROM "quotes" q WHERE q.id = o.quote_id;
