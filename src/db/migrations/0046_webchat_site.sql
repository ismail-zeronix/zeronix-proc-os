-- IF NOT EXISTS: dev databases already had these columns from the earlier 0046_site_foundation (before the website
-- data moved to its own database, src/db/site-migrations).
ALTER TABLE "web_chats" ADD COLUMN IF NOT EXISTS "site" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "web_chats" ADD COLUMN IF NOT EXISTS "context" jsonb;--> statement-breakpoint
-- every chat before zeronixtech.com came from the zeronix.ae widget
UPDATE "web_chats" SET "site" = 'zeronix.ae' WHERE "site" = '';
