ALTER TABLE "quotes" ALTER COLUMN "deal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_orders" ALTER COLUMN "deal_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "cost_aed" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "supplier_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "contact_id" integer;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "owner_id" integer;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "terms_days" integer;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- existing quotes all have a deal: copy its customer, contact and owner
UPDATE "quotes" q SET "company_id" = d."company_id", "contact_id" = d."contact_id", "owner_id" = coalesce(d."owner_id", q."created_by") FROM "deals" d WHERE d."id" = q."deal_id";--> statement-breakpoint
UPDATE "quotes" q SET "terms_days" = o."terms_days" FROM "sales_orders" o WHERE o."quote_id" = q."id";--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotes_company_idx" ON "quotes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "quotes_owner_idx" ON "quotes" USING btree ("owner_id");