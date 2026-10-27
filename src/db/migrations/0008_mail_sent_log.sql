CREATE TABLE "mail_sent_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"to_addresses" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"message_id" text DEFAULT '' NOT NULL,
	"recipients" integer DEFAULT 1 NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_sent_log" ADD CONSTRAINT "mail_sent_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_sent_user_idx" ON "mail_sent_log" USING btree ("user_id","sent_at");