CREATE TABLE "stock_inbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"chat" text DEFAULT '' NOT NULL,
	"sender_name" text DEFAULT '' NOT NULL,
	"sender_phone" text DEFAULT '' NOT NULL,
	"message_at" timestamp with time zone NOT NULL,
	"message_text" text NOT NULL,
	"items" jsonb NOT NULL,
	"price_basis" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_inbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplier_handles" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"supplier_id" integer NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"value_norm" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_handles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "price_lists" ALTER COLUMN "source" SET DEFAULT 'whatsapp';--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "chat" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "sender" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "fingerprint" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "seen_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_inbox" ADD CONSTRAINT "stock_inbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_inbox" ADD CONSTRAINT "stock_inbox_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_handles" ADD CONSTRAINT "supplier_handles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_handles" ADD CONSTRAINT "supplier_handles_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_handles_uq" ON "supplier_handles" USING btree ("organization_id","kind","value_norm");--> statement-breakpoint
CREATE INDEX "supplier_handles_supplier_idx" ON "supplier_handles" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_lists_fingerprint_uq" ON "price_lists" USING btree ("supplier_id","fingerprint") WHERE "price_lists"."fingerprint" <> '';--> statement-breakpoint
CREATE POLICY "org_isolation" ON "stock_inbox" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "supplier_handles" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);