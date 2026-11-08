CREATE TABLE "invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'sales' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"last_totp_step" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "platform_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT nullif(current_setting('app.org_id', true), '')::int,
	"admin_id" integer,
	"admin_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_admin_id_platform_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_org_idx" ON "invites" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_audit_org_idx" ON "platform_audit_log" USING btree ("organization_id","at");--> statement-breakpoint
CREATE POLICY "org_isolation" ON "invites" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "platform_audit_log" AS PERMISSIVE FOR SELECT TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
-- platform tables: the app's role never reads platform admins (no policy = no rows), and tenants only read their audit rows
ALTER TABLE "platform_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_admins" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- an invitation link: the person following it is not signed in to the organisation yet
CREATE OR REPLACE FUNCTION app_invite_lookup(p_token_hash text)
RETURNS TABLE (id integer, organization_id integer, org_name text, org_active boolean, email text, name text, role text, expires_at timestamptz, used_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT i.id, i.organization_id, o.name, o.status = 'active', i.email, i.name, i.role, i.expires_at, i.used_at
  FROM invites i JOIN organizations o ON o.id = i.organization_id
  WHERE i.token_hash = p_token_hash
  LIMIT 1
$fn$;
