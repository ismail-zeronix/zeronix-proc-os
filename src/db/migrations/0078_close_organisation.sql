ALTER TABLE "organizations" ADD COLUMN "delete_after" date;--> statement-breakpoint
-- Closing an organisation for good (platform console only: src/db/roles.ts takes it away from the app's role). Deletes
-- every row of the organisation in every table that has organization_id, keeps the platform's own audit trail (its
-- link to the organisation is cleared), unlinks its trial request, then the organisation itself. Refuses organisation
-- 1, an organisation that is not paused, and one whose deletion date has not come (unless nobody ever joined it).
-- Foreign keys and the ledger's locks are triggers: they are off for this transaction only (session_replication_role),
-- since everything they protect goes too.
CREATE OR REPLACE FUNCTION platform_delete_org(p_org integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  o record;
  t record;
  c integer;
  n integer := 0;
BEGIN
  IF p_org = 1 THEN
    RAISE EXCEPTION 'organisation 1 is never deleted';
  END IF;
  SELECT id, status, delete_after INTO o FROM organizations WHERE id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no organisation %', p_org;
  END IF;
  IF o.status <> 'suspended' THEN
    RAISE EXCEPTION 'pause the organisation first';
  END IF;
  IF NOT ((o.delete_after IS NOT NULL AND o.delete_after <= current_date) OR NOT EXISTS (SELECT 1 FROM users WHERE organization_id = p_org)) THEN
    RAISE EXCEPTION 'its deletion date has not come yet';
  END IF;
  PERFORM set_config('session_replication_role', 'replica', true);
  FOR t IN
    SELECT c.table_name::text AS name
    FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id' AND c.table_name <> 'platform_audit_log'
  LOOP
    EXECUTE format('DELETE FROM %I WHERE organization_id = $1', t.name) USING p_org;
    GET DIAGNOSTICS c = ROW_COUNT;
    n := n + c;
  END LOOP;
  UPDATE platform_audit_log SET organization_id = NULL WHERE organization_id = p_org;
  UPDATE trial_requests SET org_id = NULL WHERE org_id = p_org;
  DELETE FROM organizations WHERE id = p_org;
  PERFORM set_config('session_replication_role', 'origin', true);
  RETURN n;
END
$fn$;--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_delete_org(integer) FROM PUBLIC;
