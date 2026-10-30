CREATE TABLE "outreach_suppression" (
	"id" serial PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"kind" text NOT NULL,
	"reason" text DEFAULT 'manual' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_suppression_value_unique" UNIQUE("value")
);
--> statement-breakpoint
CREATE TABLE "prospect_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"user_id" integer,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"domain" text,
	"website" text DEFAULT '' NOT NULL,
	"emirate" text DEFAULT '' NOT NULL,
	"free_zone" text DEFAULT '' NOT NULL,
	"license_no" text DEFAULT '' NOT NULL,
	"license_date" date,
	"activity" text DEFAULT '' NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"segment_key" text,
	"size_band" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"linkedin_url" text DEFAULT '' NOT NULL,
	"source_id" integer,
	"source_url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'sourced' NOT NULL,
	"disqualify_reason" text DEFAULT '' NOT NULL,
	"score_fit" integer DEFAULT 0 NOT NULL,
	"score_signal" integer DEFAULT 0 NOT NULL,
	"score_reach" integer DEFAULT 0 NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"owner_id" integer,
	"personal_line" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"snooze_until" date,
	"crm_company_id" integer,
	"crm_deal_id" integer,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_people" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"role_kind" text DEFAULT 'decision' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"email_status" text DEFAULT 'guess' NOT NULL,
	"email_source" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"linkedin_url" text DEFAULT '' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_segments" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"offer" text DEFAULT '' NOT NULL,
	"key_roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"kind" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"observed_on" date NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"access" text DEFAULT 'manual' NOT NULL,
	"segment_key" text,
	"notes" text DEFAULT '' NOT NULL,
	"terms_checked_at" date,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospect_sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "outreach_suppression" ADD CONSTRAINT "outreach_suppression_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_activities" ADD CONSTRAINT "prospect_activities_company_id_prospect_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."prospect_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_activities" ADD CONSTRAINT "prospect_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_companies" ADD CONSTRAINT "prospect_companies_segment_key_prospect_segments_key_fk" FOREIGN KEY ("segment_key") REFERENCES "public"."prospect_segments"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_companies" ADD CONSTRAINT "prospect_companies_source_id_prospect_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."prospect_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_companies" ADD CONSTRAINT "prospect_companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_companies" ADD CONSTRAINT "prospect_companies_crm_company_id_companies_id_fk" FOREIGN KEY ("crm_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_companies" ADD CONSTRAINT "prospect_companies_crm_deal_id_deals_id_fk" FOREIGN KEY ("crm_deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_people" ADD CONSTRAINT "prospect_people_company_id_prospect_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."prospect_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_signals" ADD CONSTRAINT "prospect_signals_company_id_prospect_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."prospect_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_signals" ADD CONSTRAINT "prospect_signals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_sources" ADD CONSTRAINT "prospect_sources_segment_key_prospect_segments_key_fk" FOREIGN KEY ("segment_key") REFERENCES "public"."prospect_segments"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospect_activities_company_idx" ON "prospect_activities" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prospect_companies_domain_uq" ON "prospect_companies" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "prospect_companies_name_norm_idx" ON "prospect_companies" USING btree ("name_norm");--> statement-breakpoint
CREATE INDEX "prospect_companies_status_idx" ON "prospect_companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prospect_companies_segment_idx" ON "prospect_companies" USING btree ("segment_key");--> statement-breakpoint
CREATE INDEX "prospect_people_company_idx" ON "prospect_people" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "prospect_people_email_idx" ON "prospect_people" USING btree ("email");--> statement-breakpoint
CREATE INDEX "prospect_signals_company_idx" ON "prospect_signals" USING btree ("company_id");
--> statement-breakpoint
INSERT INTO "prospect_segments" ("key", "label", "offer", "key_roles", "position") VALUES
	('new_company', 'New free-zone companies', 'New office IT setup: laptops, desktops, network and Wi-Fi, firewall, printer, website', ARRAY['Founder', 'Managing Director', 'General Manager']::text[], 1),
	('professional', 'Professional firms', 'Laptop fleet, refresh and accessories, AMC, Microsoft 365 setup', ARRAY['Managing Director', 'Office Manager', 'Admin Manager', 'IT Manager']::text[], 2),
	('engineering', 'Engineering, architecture and contracting', 'CAD/BIM workstations, GPUs, servers, site CCTV', ARRAY['IT Manager', 'Operations Manager', 'Owner']::text[], 3),
	('education', 'Schools and training centres', 'Student and staff laptops, networking, CCTV, classroom AV', ARRAY['Principal', 'Bursar', 'IT Coordinator']::text[], 4),
	('healthcare', 'Clinics, hospitals and pharmacies', 'Desktops, servers, CCTV, networking', ARRAY['Practice Manager', 'Operations Manager', 'IT Manager']::text[], 5),
	('hospitality', 'Hotels, restaurants and retail', 'CCTV, networking, POS hardware, AV', ARRAY['IT Manager', 'Chief Engineer', 'Operations Manager']::text[], 6),
	('logistics', 'Logistics, warehouses and trading', 'CCTV, networking, servers, rugged devices', ARRAY['Operations Manager', 'IT Manager', 'Owner']::text[], 7),
	('it_trade', 'IT integrators, installers and resellers', 'Trade supply from ready stock, price lists, fast delivery', ARRAY['Owner', 'Purchasing Manager']::text[], 8),
	('web_services', 'Companies with a weak website', 'New website, web app or software', ARRAY['Owner', 'Marketing Manager']::text[], 9)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "prospect_sources" ("key", "name", "url", "access", "segment_key", "notes") VALUES
	('manual', 'Manual research', '', 'manual', NULL, 'Added by hand after looking the company up.'),
	('file_import', 'File import', '', 'import', NULL, 'CSV or Excel lists: exhibitions, directories, chamber lists.'),
	('meydan_fz', 'Meydan Free Zone announcements', 'https://www.meydanfz.ae', 'manual', 'new_company', 'Newly licensed companies. Check the terms before the scraper reads it.'),
	('difc_register', 'DIFC public register', 'https://www.difc.ae/public-register', 'manual', 'professional', 'Official public register.'),
	('adgm_register', 'ADGM public registers', 'https://www.adgm.com/public-registers', 'manual', 'professional', 'Official public register.'),
	('khda_schools', 'KHDA schools directory', 'https://web.khda.gov.ae', 'manual', 'education', 'Dubai private schools.'),
	('dha_facilities', 'DHA licensed health facilities', 'https://www.dha.gov.ae', 'manual', 'healthcare', 'Clinics, hospitals and pharmacies in Dubai.'),
	('dubai_chamber', 'Dubai Chamber member directory', 'https://www.dubaichamber.com', 'manual', NULL, 'Members by activity.'),
	('yellowpages_uae', 'Yellow Pages UAE', 'https://www.yellowpages-uae.com', 'manual', NULL, 'Business directory by category.'),
	('google_places', 'Google Places API', 'https://developers.google.com/maps/documentation/places/web-service', 'api', NULL, 'Official API only; needs a key. Never scrape Google Maps.'),
	('gitex_exhibitors', 'GITEX exhibitor list', 'https://www.gitex.com', 'manual', 'it_trade', 'Exhibitors are buyers and partners.'),
	('linkedin', 'LinkedIn', 'https://www.linkedin.com', 'manual', NULL, 'People research by hand only; their terms forbid scraping.')
ON CONFLICT ("key") DO NOTHING;
