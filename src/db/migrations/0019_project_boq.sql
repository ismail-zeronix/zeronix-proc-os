ALTER TABLE "deal_items" ADD COLUMN "section" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "deal_items" ADD COLUMN "unit" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "deal_items" ADD COLUMN "line_type" text DEFAULT 'material' NOT NULL;--> statement-breakpoint
ALTER TABLE "deal_items" ADD COLUMN "optional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_types" ADD COLUMN "default_sections" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "boq_sections" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "section" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "unit" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "project_types" SET "default_sections" = ARRAY['Cameras & recording', 'Cabling & accessories', 'Installation', 'Testing & commissioning']::text[] WHERE "key" = 'cctv';
--> statement-breakpoint
UPDATE "project_types" SET "default_sections" = ARRAY['Network equipment', 'Structured cabling', 'Installation', 'Testing & certification']::text[] WHERE "key" = 'networking';
--> statement-breakpoint
UPDATE "project_types" SET "default_sections" = ARRAY['Racks & power', 'Network & servers', 'Cooling & environment', 'Installation & commissioning']::text[] WHERE "key" = 'server_room';
--> statement-breakpoint
UPDATE "project_types" SET "default_sections" = ARRAY['Controllers & readers', 'Locks & accessories', 'Cabling', 'Installation & programming']::text[] WHERE "key" = 'access_control';
--> statement-breakpoint
UPDATE "project_types" SET "default_sections" = ARRAY['Display & audio', 'Conferencing', 'Cabling & accessories', 'Installation & programming']::text[] WHERE "key" = 'av';
--> statement-breakpoint
UPDATE "project_types" SET "default_sections" = ARRAY['Hardware', 'Network', 'Software & licences', 'Installation & setup']::text[] WHERE "key" = 'it_fitout';
--> statement-breakpoint
UPDATE "project_types" SET "default_sections" = ARRAY['Design', 'Development', 'Hosting & licences', 'Training & support']::text[] WHERE "key" = 'software';
--> statement-breakpoint
UPDATE "project_types" SET "default_sections" = ARRAY['Materials', 'Installation', 'Services']::text[] WHERE "key" = 'other';
--> statement-breakpoint
UPDATE "projects" p SET "boq_sections" = t."default_sections" FROM "project_types" t WHERE t."key" = p."type_key" AND cardinality(p."boq_sections") = 0;
