CREATE TABLE "prospect_ai_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"model_id" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"context_length" integer DEFAULT 0 NOT NULL,
	"json" boolean DEFAULT false NOT NULL,
	"expires_on" date,
	"position" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cooldown_until" timestamp with time zone,
	"ok_count" integer DEFAULT 0 NOT NULL,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "prospect_ai_providers" ADD COLUMN "auto_free" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_ai_providers" ADD COLUMN "paid_search" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_ai_providers" ADD COLUMN "out_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospect_ai_providers" ADD COLUMN "usage" jsonb;--> statement-breakpoint
ALTER TABLE "prospect_ai_providers" ADD COLUMN "models_refreshed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospect_ai_models" ADD CONSTRAINT "prospect_ai_models_provider_id_prospect_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."prospect_ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prospect_ai_models_uq" ON "prospect_ai_models" USING btree ("provider_id","model_id");