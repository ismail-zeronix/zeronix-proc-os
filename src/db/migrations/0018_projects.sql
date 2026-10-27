CREATE TABLE "project_types" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	"number" text NOT NULL,
	"deal_id" integer NOT NULL,
	"type_key" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"manager_id" integer,
	"site_address" text DEFAULT '' NOT NULL,
	"site_map_url" text DEFAULT '' NOT NULL,
	"start_date" date,
	"target_date" date,
	"completed_on" date,
	"closed_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_number_unique" UNIQUE("number"),
	CONSTRAINT "projects_deal_id_unique" UNIQUE("deal_id")
);
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "kind" text DEFAULT 'product' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_type_key_project_types_key_fk" FOREIGN KEY ("type_key") REFERENCES "public"."project_types"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_year_seq_idx" ON "projects" USING btree ("year","seq");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_type_idx" ON "projects" USING btree ("type_key");--> statement-breakpoint
INSERT INTO "project_types" ("key", "label", "position") VALUES
	('cctv', 'CCTV', 1),
	('networking', 'Networking & cabling', 2),
	('server_room', 'Server room', 3),
	('access_control', 'Access control', 4),
	('av', 'AV & meeting rooms', 5),
	('it_fitout', 'Office IT setup', 6),
	('software', 'Software & websites', 7),
	('other', 'Other', 8)
ON CONFLICT ("key") DO NOTHING;
