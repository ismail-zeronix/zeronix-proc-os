CREATE TABLE "site_keyword_ranks" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword_id" integer NOT NULL,
	"checked_on" date NOT NULL,
	"position" integer,
	"url" text DEFAULT '' NOT NULL,
	"top" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_keyword_ranks" ADD CONSTRAINT "site_keyword_ranks_keyword_id_site_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."site_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_keyword_ranks_day_uq" ON "site_keyword_ranks" USING btree ("keyword_id","checked_on");--> statement-breakpoint
CREATE INDEX "site_keyword_ranks_day_idx" ON "site_keyword_ranks" USING btree ("checked_on");