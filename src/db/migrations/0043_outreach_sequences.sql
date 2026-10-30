CREATE TABLE "outreach_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sequence_id" integer NOT NULL,
	"mailbox_ids" integer[] DEFAULT '{}'::int[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"owner_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"next_send_at" timestamp with time zone,
	"mailbox_id" integer,
	"thread_message_id" text DEFAULT '' NOT NULL,
	"stop_reason" text DEFAULT '' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_sequence_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"sequence_id" integer NOT NULL,
	"position" integer NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"segment_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_sequence_id_outreach_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."outreach_sequences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD CONSTRAINT "outreach_enrollments_campaign_id_outreach_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."outreach_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD CONSTRAINT "outreach_enrollments_company_id_prospect_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."prospect_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD CONSTRAINT "outreach_enrollments_person_id_prospect_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."prospect_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD CONSTRAINT "outreach_enrollments_mailbox_id_outreach_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."outreach_mailboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD CONSTRAINT "outreach_enrollments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_enrollments" ADD CONSTRAINT "outreach_enrollments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequence_steps" ADD CONSTRAINT "outreach_sequence_steps_sequence_id_outreach_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."outreach_sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_segment_key_prospect_segments_key_fk" FOREIGN KEY ("segment_key") REFERENCES "public"."prospect_segments"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outreach_enrollments_campaign_idx" ON "outreach_enrollments" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "outreach_enrollments_company_idx" ON "outreach_enrollments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "outreach_enrollments_due_idx" ON "outreach_enrollments" USING btree ("status","next_send_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_enrollments_open_uq" ON "outreach_enrollments" USING btree ("person_id") WHERE status in ('draft','active','paused');--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_sequence_steps_uq" ON "outreach_sequence_steps" USING btree ("sequence_id","position");
--> statement-breakpoint
INSERT INTO "outreach_sequences" ("id", "name") VALUES (1, 'New office IT (4 emails over 2 weeks)') ON CONFLICT DO NOTHING;
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('outreach_sequences', 'id'), GREATEST((SELECT max(id) FROM outreach_sequences), 1));
--> statement-breakpoint
INSERT INTO "outreach_sequence_steps" ("sequence_id", "position", "delay_days", "subject", "body") VALUES
	(1, 1, 0, $s${company} and your IT setup$s$, $b$Hi {first_name},

{personal_line}

We are Zeronix, an IT supplier in Dubai. We help with {offer_line}, usually from ready stock within a few days, with setup and support if you need it.

Would a quick call this week be useful to see if we can help?$b$),
	(1, 2, 3, '', $b$Hi {first_name},

Bringing this back to the top of your inbox. If it helps, I can send a short price list for what a new office usually needs (laptops, network, printers), so you have something to compare against.

Shall I send it over?$b$),
	(1, 3, 4, '', $b$Hi {first_name},

One more idea: companies like {company} often save time by having one supplier handle the hardware, cabling and Microsoft 365 setup, with one contact afterwards. We do this for offices across the UAE, with a support contract if you want it.

Happy to share a couple of examples if that is useful.$b$),
	(1, 4, 7, '', $b$Hi {first_name},

I do not want to keep filling your inbox, so this is my last note. If IT purchases are handled by someone else at {company}, could you point me to the right person?

Thanks either way.$b$)
ON CONFLICT DO NOTHING;
