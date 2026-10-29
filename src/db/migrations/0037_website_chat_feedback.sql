ALTER TABLE "web_chats" ADD COLUMN "pages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "web_chats" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "web_chats" ADD COLUMN "feedback_tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "web_chats" ADD COLUMN "feedback" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "web_chats" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "web_chats" ADD COLUMN "deal_id" integer;--> statement-breakpoint
ALTER TABLE "web_chats" ADD CONSTRAINT "web_chats_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;