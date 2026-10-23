ALTER TABLE "brand_profile" ADD COLUMN "doc_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "doc_phones" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "trade_license" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "logo_dark_b64" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "logo_dark_mime" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "signature_b64" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "signature_mime" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "stamp_b64" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "stamp_mime" text DEFAULT '' NOT NULL;