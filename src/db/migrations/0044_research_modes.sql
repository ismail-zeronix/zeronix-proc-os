ALTER TABLE "prospect_research_runs" ADD COLUMN "mode" text DEFAULT 'site' NOT NULL;--> statement-breakpoint
ALTER TABLE "prospect_research_runs" ADD COLUMN "stage" text DEFAULT '' NOT NULL;