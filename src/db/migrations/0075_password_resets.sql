CREATE TABLE "password_resets" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "password_resets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE POLICY "org_isolation" ON "password_resets" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
ALTER TABLE "password_resets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- a "forgot password" link is opened before anyone is signed in, so the organisation is not known yet: this finds the
-- link by its hash (the only read of password_resets across organisations), with what the reset page needs
CREATE OR REPLACE FUNCTION app_reset_lookup(p_token_hash text)
RETURNS TABLE (id integer, organization_id integer, user_id integer, email text, user_active boolean, org_active boolean, expires_at timestamptz, used_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.id, r.organization_id, r.user_id, u.email, u.is_active, o.status = 'active', r.expires_at, r.used_at
  FROM password_resets r JOIN users u ON u.id = r.user_id JOIN organizations o ON o.id = r.organization_id
  WHERE r.token_hash = p_token_hash
  LIMIT 1
$fn$;