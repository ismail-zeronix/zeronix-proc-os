ALTER TABLE "web_chats" ADD COLUMN "visitor_key" text;--> statement-breakpoint
ALTER TABLE "web_chats" ADD COLUMN "client" jsonb;--> statement-breakpoint
ALTER TABLE "web_chats" ADD COLUMN "geo" jsonb;--> statement-breakpoint
CREATE INDEX "web_chats_visitor_idx" ON "web_chats" USING btree ("visitor_key");