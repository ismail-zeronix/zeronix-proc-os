CREATE TABLE "check_ins" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"missed" boolean DEFAULT false NOT NULL,
	"done" text[] DEFAULT '{}'::text[] NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"counts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_ins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"counts" jsonb NOT NULL,
	"note" text NOT NULL,
	"behind_reason" text DEFAULT '' NOT NULL,
	"moved" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sales_targets" jsonb;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "check_ins_user_due_uq" ON "check_ins" USING btree ("organization_id","user_id","due_at");--> statement-breakpoint
CREATE INDEX "check_ins_day_idx" ON "check_ins" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_reports_user_day_uq" ON "daily_reports" USING btree ("organization_id","user_id","day");--> statement-breakpoint
CREATE INDEX "daily_reports_day_idx" ON "daily_reports" USING btree ("day");--> statement-breakpoint
CREATE POLICY "org_isolation" ON "check_ins" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "daily_reports" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);