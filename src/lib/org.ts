import "server-only";
import { eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db, runAsOrg, schema } from "@/db";
import { resolveOrgId } from "@/db/org-context";
import { UserError } from "@/lib/user-error";
import { getBrandRow } from "@/lib/brand";
import { getSetting } from "@/lib/settings";
import type { Tx } from "@/lib/tx";

/**
 * Organisations (tenants). Zeronix is 1. Every table carries organization_id with the org_isolation row-level-security
 * policy, and the connection pool sets app.org_id for every query (db/index.ts, db/org-context.ts), so a query only ever
 * sees the current organisation's rows. withOrg() also sets it inside one transaction, as the ledger has always done.
 */
export const DEFAULT_ORG_ID = 1;

/**
 * The organisation the current work is for: runAsOrg(), else the signed-in user's, else the fallback of a single-company
 * install. A SaaS request with none of these has no organisation, and that is an error, never organisation 1.
 */
export async function currentOrgId(): Promise<number> {
  const org = await resolveOrgId();
  if (!org) throw new UserError("Please sign in again.");
  return org;
}

/** Tells Postgres which organisation this transaction works for (read by the org_isolation policies). */
export async function setTxOrg(tx: Tx, orgId: number): Promise<void> {
  if (!Number.isInteger(orgId) || orgId < 1) throw new Error(`Bad organisation id: ${orgId}`);
  await tx.execute(sql`SELECT set_config('app.org_id', ${String(orgId)}, true)`);
}

/** Runs `fn` in a transaction scoped to one organisation. Use it for every ledger read and write. */
export function withOrg<T>(orgId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAsOrg(orgId, () =>
    db.transaction(async (tx) => {
      await setTxOrg(tx, orgId);
      return fn(tx);
    }),
  );
}

export interface OrgProfile {
  id: number;
  name: string;
  legalName: string;
  country: string;
  baseCurrency: string;
  taxRegime: "AE_VAT" | "IN_GST";
  emirate: string;
  fiscalYearStartMonth: number;
  timezone: string;
  /** TRN in the UAE, GSTIN in India. Zeronix keeps it in Accounts › Settings › VAT registration (quote_trn). */
  taxRegNo: string;
  tradeLicense: string;
}

/**
 * Everything accounting needs to know about an organisation. The TRN and trade licence live where the documents read
 * them (Accounts › Settings, brand profile), one copy each, per organisation. Left out: the current organisation.
 */
export const orgProfile = cache(async (orgId?: number): Promise<OrgProfile> => {
  const id = orgId ?? (await currentOrgId());
  const [org, trn, brand] = await runAsOrg(id, () =>
    Promise.all([db.select().from(schema.organizations).where(eq(schema.organizations.id, id)).limit(1).then((r) => r[0]), getSetting("quote_trn"), getBrandRow()]),
  );
  if (!org) throw new Error(`Organisation ${id} not found`);
  return {
    id: org.id,
    name: org.name,
    legalName: org.legalName || org.name,
    country: org.country,
    baseCurrency: org.baseCurrency,
    taxRegime: org.taxRegime,
    emirate: org.emirate,
    fiscalYearStartMonth: org.fiscalYearStartMonth,
    timezone: org.timezone,
    taxRegNo: trn.trim(),
    tradeLicense: brand?.tradeLicense ?? "",
  };
});

/** The fiscal year a day falls in, named by the calendar year it starts in (India: 2026-05-10 → 2026, 2027-02-01 → 2026). */
export function fiscalYearOf(day: string, startMonth: number): number {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  return m >= startMonth ? y : y - 1;
}
