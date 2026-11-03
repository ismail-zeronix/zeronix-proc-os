CREATE TABLE "site_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"trn" text DEFAULT '' NOT NULL,
	"address" jsonb DEFAULT '{"emirate":"","area":"","street":""}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "site_customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "site_login_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"tries" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"customer_id" integer,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"trn" text DEFAULT '' NOT NULL,
	"delivery" text DEFAULT 'delivery' NOT NULL,
	"address" jsonb DEFAULT '{"emirate":"","area":"","street":""}'::jsonb NOT NULL,
	"payment" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"vat" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"internal_note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"site" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "site_orders" ADD CONSTRAINT "site_orders_customer_id_site_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."site_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_login_codes_email_idx" ON "site_login_codes" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "site_orders_status_idx" ON "site_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "site_orders_customer_idx" ON "site_orders" USING btree ("customer_id","created_at");