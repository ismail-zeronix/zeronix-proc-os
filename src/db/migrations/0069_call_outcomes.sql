ALTER TABLE "activities" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "contact_id" integer;--> statement-breakpoint
ALTER TABLE "prospect_activities" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_user_idx" ON "activities" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "prospect_activities_user_idx" ON "prospect_activities" USING btree ("user_id","created_at");