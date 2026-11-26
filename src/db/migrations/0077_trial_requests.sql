CREATE TABLE "trial_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"team_size" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"org_id" integer,
	"decided_at" timestamp with time zone,
	"decided_by" integer,
	"decline_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial_requests" ADD CONSTRAINT "trial_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_requests" ADD CONSTRAINT "trial_requests_decided_by_platform_admins_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."platform_admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trial_requests_status_idx" ON "trial_requests" USING btree ("status","created_at");--> statement-breakpoint
-- the platform console's alone (zx_platform skips row-level security); with no policy the app's role sees no row,
-- and src/db/roles.ts takes its rights away too
ALTER TABLE "trial_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trial_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- the public "Request a free trial" form: adds a request, or returns the open one from the same email this week
CREATE OR REPLACE FUNCTION app_trial_request(p_company text, p_contact text, p_email text, p_phone text, p_size text, p_message text, p_ip text)
RETURNS TABLE (id integer, is_new boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r integer;
BEGIN
  SELECT t.id INTO r FROM trial_requests t
  WHERE lower(t.email) = lower(p_email) AND t.status = 'new' AND t.created_at > now() - interval '7 days'
  ORDER BY t.id DESC LIMIT 1;
  IF r IS NOT NULL THEN
    RETURN QUERY SELECT r, false;
    RETURN;
  END IF;
  INSERT INTO trial_requests (company, contact_name, email, phone, team_size, message, ip)
  VALUES (left(p_company, 160), left(p_contact, 120), lower(left(p_email, 200)), left(p_phone, 40), left(p_size, 20), left(p_message, 600), left(p_ip, 64))
  RETURNING trial_requests.id INTO r;
  RETURN QUERY SELECT r, true;
END
$fn$;