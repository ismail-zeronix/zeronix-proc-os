ALTER TABLE "site_categories" ADD COLUMN "intro" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_categories" ADD COLUMN "intro_html" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_categories" ADD COLUMN "faq" jsonb DEFAULT '[]'::jsonb NOT NULL;