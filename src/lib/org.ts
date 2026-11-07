import "server-only";
import { eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import { getBrandRow } from "@/lib/brand";
import { getSetting } from "@/lib/settings";
import type { Tx } from "@/lib/tx";

/**
 * Organisations (tenants). Today there is one: Zeronix, id 1, and every row defaults to it. The base for more is here:
 * new tables carry organization_id plus the org_isolation RLS policy, and new ledger code runs through withOrg() so the
 * database knows whose rows a transaction may see. The policies are enforced once the app connects as a non-owner role
 * (Phase T of the accounts plan); until then they are inert and this module only passes the id along.
 */
export const DEFAULT_ORG_ID = 1;

/** The signed-in user's organisation. Always Zeronix until users can belong to more than one (Phase T). */
export async function currentOrgId(): Promise<number> {
  return DEFAULT_ORG_ID;
}

/** Tells Postgres which organisation this transaction works for (read by the org_isolation policies). */
export async function setTxOrg(tx: Tx, orgId: number): Promise<void> {
  if (!Number.isInteger(orgId) || orgId < 1) throw new Error(`Bad organisation id: ${orgId}`);
  await tx.execute(sql`SELECT set_config('app.org_id', ${String(orgId)}, true)`);
}

/** Runs `fn` in a transaction scoped to one organisation. Use it for every ledger read and write. */
export function withOrg<T>(orgId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await setTxOrg(tx, orgId);
    return fn(tx);
  });
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
 * Everything accounting needs to know about an organisation. For Zeronix the TRN and trade licence still live where the
 * documents read them (settings, brand profile), so there is one copy of each; they move onto the organisation in Phase T.
 */
export const orgProfile = cache(async (orgId: number = DEFAULT_ORG_ID): Promise<OrgProfile> => {
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
  if (!org) throw new Error(`Organisation ${orgId} not found`);
  const [trn, brand] = orgId === DEFAULT_ORG_ID ? await Promise.all([getSetting("quote_trn"), getBrandRow()]) : ["", null];
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
