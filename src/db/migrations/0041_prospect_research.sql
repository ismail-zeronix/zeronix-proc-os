CREATE TABLE "prospect_research_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"domain" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"result" jsonb,
	"error" text DEFAULT '' NOT NULL,
	"pages_read" integer DEFAULT 0 NOT NULL,
	"ai_status" text DEFAULT '' NOT NULL,
	"ai_provider_id" integer,
	"ai_tokens" integer DEFAULT 0 NOT NULL,
	"ai_result" jsonb,
	"summary" text DEFAULT '' NOT NULL,
	"requested_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "prospect_ai_providers" ADD COLUMN "daily_limit" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_research_runs" ADD CONSTRAINT "prospect_research_runs_company_id_prospect_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."prospect_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_research_runs" ADD CONSTRAINT "prospect_research_runs_ai_provider_id_prospect_ai_providers_id_fk" FOREIGN KEY ("ai_provider_id") REFERENCES "public"."prospect_ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_research_runs" ADD CONSTRAINT "prospect_research_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospect_research_runs_status_idx" ON "prospect_research_runs" USING btree ("status","id");--> statement-breakpoint
CREATE INDEX "prospect_research_runs_company_idx" ON "prospect_research_runs" USING btree ("company_id","id");