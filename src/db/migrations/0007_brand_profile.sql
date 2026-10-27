CREATE TABLE "brand_profile" (
	"id" integer PRIMARY KEY NOT NULL,
	"company" text DEFAULT 'Zeronix' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"main_phone" text DEFAULT '' NOT NULL,
	"layout" text DEFAULT 'left' NOT NULL,
	"color" text DEFAULT '#2a78d6' NOT NULL,
	"disclaimer" text DEFAULT '' NOT NULL,
	"logo_b64" text DEFAULT '' NOT NULL,
	"logo_mime" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mobile" text DEFAULT '' NOT NULL;