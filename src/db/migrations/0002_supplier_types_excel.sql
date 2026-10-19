ALTER TABLE "offers" ADD COLUMN "price_basis" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "source" text DEFAULT 'paste' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "source_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "type" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "default_currency" text DEFAULT 'AED' NOT NULL;