CREATE TABLE "error_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"route_type" text DEFAULT '' NOT NULL,
	"route_path" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"digest" text DEFAULT '' NOT NULL,
	"stack" text DEFAULT '' NOT NULL,
	"user_id" integer
);
--> statement-breakpoint
ALTER TABLE "error_log" ADD CONSTRAINT "error_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "error_log_at_idx" ON "error_log" USING btree ("at");