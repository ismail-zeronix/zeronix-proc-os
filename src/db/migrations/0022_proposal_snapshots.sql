CREATE TABLE "proposal_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposal_id" integer NOT NULL,
	"quote_id" integer NOT NULL,
	"blocks" jsonb NOT NULL,
	"boq" jsonb NOT NULL,
	"cover" jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_snapshots_quote_id_unique" UNIQUE("quote_id")
);
--> statement-breakpoint
ALTER TABLE "proposal_snapshots" ADD CONSTRAINT "proposal_snapshots_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_snapshots" ADD CONSTRAINT "proposal_snapshots_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_snapshots" ADD CONSTRAINT "proposal_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;