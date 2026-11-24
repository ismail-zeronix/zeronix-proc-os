CREATE TABLE "employee_advances" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"number" text NOT NULL,
	"user_id" integer NOT NULL,
	"employee_name" text NOT NULL,
	"paid_on" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" text NOT NULL,
	"bank_account_id" integer,
	"reference" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_advances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employee_pay" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"user_id" integer NOT NULL,
	"base_salary" numeric(14, 2) DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_pay" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pay_item_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"system_key" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pay_item_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payslip_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"payslip_id" integer NOT NULL,
	"type_id" integer,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"system_key" text,
	"amount" numeric(14, 2) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payslip_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"number" text NOT NULL,
	"user_id" integer NOT NULL,
	"month" text NOT NULL,
	"employee_name" text NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"base_salary" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"gross" numeric(14, 2) DEFAULT 0 NOT NULL,
	"deductions" numeric(14, 2) DEFAULT 0 NOT NULL,
	"net" numeric(14, 2) DEFAULT 0 NOT NULL,
	"attendance" jsonb,
	"notes" text DEFAULT '' NOT NULL,
	"paid_on" date,
	"method" text,
	"bank_account_id" integer,
	"reference" text DEFAULT '' NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payslips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay" ADD CONSTRAINT "employee_pay_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay" ADD CONSTRAINT "employee_pay_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_item_types" ADD CONSTRAINT "pay_item_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payslip_id_payslips_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_type_id_pay_item_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."pay_item_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_advances_number_uq" ON "employee_advances" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "employee_advances_user_idx" ON "employee_advances" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_pay_user_uq" ON "employee_pay" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_item_types_name_uq" ON "pay_item_types" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "payslip_lines_slip_idx" ON "payslip_lines" USING btree ("payslip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_number_uq" ON "payslips" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_user_month_uq" ON "payslips" USING btree ("user_id","month") WHERE status <> 'void';--> statement-breakpoint
CREATE INDEX "payslips_month_idx" ON "payslips" USING btree ("organization_id","month");--> statement-breakpoint
CREATE POLICY "org_isolation" ON "employee_advances" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "employee_pay" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "pay_item_types" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "payslip_lines" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "payslips" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);