DROP TABLE "parse_corrections" CASCADE;--> statement-breakpoint
-- the in-app AI reading is gone: lists still waiting for it are closed with a note (Claude pushes them now)
UPDATE "price_lists" SET "status" = 'failed', "error" = 'AI reading was removed. Ask Claude to push this message from WhatsApp.', "drafts" = NULL WHERE "status" IN ('queued', 'parsing');--> statement-breakpoint
DELETE FROM "settings" WHERE "key" IN ('llm_model', 'llm_provider_id', 'ai_running', 'ai_interval_minutes', 'ai_last_run_at', 'ai_stop_at');
