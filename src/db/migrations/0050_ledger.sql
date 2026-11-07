CREATE TABLE "accounting_settings" (
	"organization_id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"lock_date" date,
	"cutover_date" date,
	"vat_period_months" integer DEFAULT 3 NOT NULL,
	"vat_period_start_month" integer DEFAULT 1 NOT NULL,
	"coa_template" text DEFAULT 'ae-trading' NOT NULL,
	"coa_version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
ALTER TABLE "accounting_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"account_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"bank_name" text DEFAULT '' NOT NULL,
	"account_number" text DEFAULT '' NOT NULL,
	"iban" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"number" text NOT NULL,
	"date" date NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer,
	"purpose" text DEFAULT 'post' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"reversal_of_id" integer,
	"total" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"entry_id" integer NOT NULL,
	"line_no" integer NOT NULL,
	"account_id" integer NOT NULL,
	"debit" numeric(18, 2) DEFAULT 0 NOT NULL,
	"credit" numeric(18, 2) DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"fx_rate" numeric(18, 6) DEFAULT 1 NOT NULL,
	"debit_fc" numeric(18, 2) DEFAULT 0 NOT NULL,
	"credit_fc" numeric(18, 2) DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"party_type" text,
	"party_id" integer,
	"tax_code_id" integer,
	"tax_base" numeric(18, 2),
	"order_id" integer,
	"deal_id" integer,
	"project_id" integer,
	CONSTRAINT "journal_lines_one_side" CHECK (debit >= 0 AND credit >= 0 AND (debit = 0) <> (credit = 0))
);
--> statement-breakpoint
ALTER TABLE "journal_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"subtype" text DEFAULT 'other' NOT NULL,
	"parent_id" integer,
	"is_group" boolean DEFAULT false NOT NULL,
	"system_key" text,
	"currency" text DEFAULT 'AED' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tax_code_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"tax_code_id" integer NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"share" numeric(6, 4) DEFAULT 1 NOT NULL,
	"sales_account_id" integer,
	"purchase_account_id" integer
);
--> statement-breakpoint
ALTER TABLE "tax_code_components" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tax_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer DEFAULT 1 NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"rate_pct" numeric(6, 3) NOT NULL,
	"self_assessed" boolean DEFAULT false NOT NULL,
	"sale_boxes" text[] DEFAULT '{}'::text[] NOT NULL,
	"purchase_boxes" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tax_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounting_settings" ADD CONSTRAINT "accounting_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_settings" ADD CONSTRAINT "accounting_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_journal_entries_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_code_components" ADD CONSTRAINT "tax_code_components_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_code_components" ADD CONSTRAINT "tax_code_components_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_code_components" ADD CONSTRAINT "tax_code_components_sales_account_id_accounts_id_fk" FOREIGN KEY ("sales_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_code_components" ADD CONSTRAINT "tax_code_components_purchase_account_id_accounts_id_fk" FOREIGN KEY ("purchase_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_account_uq" ON "bank_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_number_uq" ON "journal_entries" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_source_uq" ON "journal_entries" USING btree ("organization_id","source_type","source_id","purpose") WHERE source_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_reversal_uq" ON "journal_entries" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("organization_id","account_id");--> statement-breakpoint
CREATE INDEX "journal_lines_party_idx" ON "journal_lines" USING btree ("party_type","party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_code_uq" ON "accounts" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_system_key_uq" ON "accounts" USING btree ("organization_id","system_key") WHERE system_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "accounts_parent_idx" ON "accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_code_components_uq" ON "tax_code_components" USING btree ("tax_code_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_codes_code_uq" ON "tax_codes" USING btree ("organization_id","code");--> statement-breakpoint
CREATE POLICY "org_isolation" ON "accounting_settings" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "bank_accounts" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "journal_entries" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "journal_lines" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "accounts" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "tax_code_components" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "tax_codes" AS PERMISSIVE FOR ALL TO public USING (organization_id = nullif(current_setting('app.org_id', true), '')::int) WITH CHECK (organization_id = nullif(current_setting('app.org_id', true), '')::int);--> statement-breakpoint
-- The ledger only grows: posted entries and lines are never changed or removed; a mistake is reversed.
-- app.ledger_maintenance = 'on' (SET LOCAL, tests and supervised repairs only) lets a transaction delete.
CREATE FUNCTION ledger_refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.ledger_maintenance', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Posted ledger entries cannot be changed or deleted: post a reversal instead';
END $$;--> statement-breakpoint
CREATE TRIGGER journal_entries_no_change BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION ledger_refuse_change();--> statement-breakpoint
CREATE TRIGGER journal_lines_no_change BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION ledger_refuse_change();--> statement-breakpoint
-- Every entry balances, has two lines or more, and its total matches its lines (checked at commit).
CREATE FUNCTION ledger_check_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  eid integer;
  d numeric;
  c numeric;
  n integer;
  t numeric;
BEGIN
  -- (an IF, not a CASE: PL/pgSQL would look up NEW.entry_id on journal_entries rows too)
  IF TG_TABLE_NAME = 'journal_entries' THEN
    eid := NEW.id;
  ELSE
    eid := NEW.entry_id;
  END IF;
  SELECT total INTO t FROM journal_entries WHERE id = eid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*) INTO d, c, n FROM journal_lines WHERE entry_id = eid;
  IF n < 2 THEN RAISE EXCEPTION 'Journal entry % needs at least two lines', eid; END IF;
  IF d <> c THEN RAISE EXCEPTION 'Journal entry % does not balance: debits % and credits %', eid, d, c; END IF;
  IF d <> t THEN RAISE EXCEPTION 'Journal entry % total % does not match its lines (%)', eid, t, d; END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_entries_balanced AFTER INSERT ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_balance();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT ON journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_balance();--> statement-breakpoint
-- Nothing is posted on or before the lock date; a reversal undoes an entry of the same organisation.
CREATE FUNCTION ledger_check_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  locked date;
BEGIN
  SELECT lock_date INTO locked FROM accounting_settings WHERE organization_id = NEW.organization_id;
  IF locked IS NOT NULL AND NEW.date <= locked THEN
    RAISE EXCEPTION 'The books are locked up to %: date it after that day', locked;
  END IF;
  IF NEW.reversal_of_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM journal_entries WHERE id = NEW.reversal_of_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'A reversal must undo an entry of the same organisation';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER journal_entries_check BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION ledger_check_entry();--> statement-breakpoint
-- A line posts to a leaf account of its own organisation, inside an entry of that organisation.
CREATE FUNCTION ledger_check_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  acc_org integer;
  acc_group boolean;
  entry_org integer;
BEGIN
  SELECT organization_id, is_group INTO acc_org, acc_group FROM accounts WHERE id = NEW.account_id;
  SELECT organization_id INTO entry_org FROM journal_entries WHERE id = NEW.entry_id;
  IF acc_org <> NEW.organization_id OR entry_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'A journal line must use an account and entry of its own organisation';
  END IF;
  IF acc_group THEN
    RAISE EXCEPTION 'Cannot post to a group account: pick one of the accounts under it';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER journal_lines_check BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION ledger_check_line();
