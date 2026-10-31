CREATE TABLE "outreach_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"enrollment_id" integer NOT NULL,
	"mailbox_id" integer,
	"step" integer NOT NULL,
	"to_email" text NOT NULL,
	"cc_emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"message_id" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "outreach_enrollments_open_uq";--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ALTER COLUMN "person_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "brief" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "industry" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "review" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD COLUMN "start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD COLUMN "to_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD COLUMN "cc_emails" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD COLUMN "ai_provider_id" integer;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD COLUMN "write_error" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_mailboxes" ADD COLUMN "last_seen_uid" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_mailboxes" ADD COLUMN "replies_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outreach_mailboxes" ADD COLUMN "last_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_enrollment_id_outreach_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."outreach_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_mailbox_id_outreach_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."outreach_mailboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outreach_messages_mailbox_idx" ON "outreach_messages" USING btree ("mailbox_id","sent_at");--> statement-breakpoint
CREATE INDEX "outreach_messages_enrollment_idx" ON "outreach_messages" USING btree ("enrollment_id");--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD CONSTRAINT "outreach_enrollments_ai_provider_id_prospect_ai_providers_id_fk" FOREIGN KEY ("ai_provider_id") REFERENCES "public"."prospect_ai_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "outreach_enrollments" e SET "to_email" = lower(p."email") FROM "prospect_people" p WHERE p."id" = e."person_id" AND e."to_email" = '';--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_enrollments_open_uq" ON "outreach_enrollments" USING btree ("company_id") WHERE status in ('writing','draft','active','paused');