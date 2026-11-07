ALTER TABLE "web_chats" ADD COLUMN "draft" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "web_chats" ADD COLUMN "draft_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "web_chats" ADD COLUMN "events" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- chats started by search engines, SEO tools and scripted browsers before the widget learnt to ignore them
DELETE FROM "web_chats" WHERE "lead_at" IS NULL AND ("user_agent" = '' OR "user_agent" ~* '(bot\y|bot/|crawl|spider|slurp|bingpreview|mediapartners|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|facebookexternalhit|preview|python|curl/|wget|phantom|selenium|puppeteer|playwright|ahrefs|semrush|yandex|baidu|bytespider|gptbot|claudebot|applebot)');
