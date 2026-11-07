import { eq } from "drizzle-orm";
import { FiscalYearForm, LockDateForm } from "@/components/settings-ui";
import { schema } from "@/db";
import { requireAccountant } from "@/lib/auth/session";
import { ledgerInUse } from "@/lib/ledger/documents";
import { ensureLedger } from "@/lib/ledger/setup";
import { currentOrgId, orgProfile, withOrg } from "@/lib/org";

export const metadata = { title: "Financial year and lock date · Zeronix Accounts" };

export default async function BooksSettingsPage() {
  await requireAccountant();
  const orgId = await currentOrgId();
  const [org, { lockDate, inUse }] = await Promise.all([
    orgProfile(orgId),
    withOrg(orgId, async (tx) => {
      await ensureLedger(tx, orgId);
      const [s] = await tx.select({ lockDate: schema.accountingSettings.lockDate }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
      return { lockDate: s?.lockDate ?? null, inUse: await ledgerInUse(tx, orgId) };
    }),
  ]);
  return (
    <>
      <FiscalYearForm key={org.fiscalYearStartMonth} month={org.fiscalYearStartMonth} locked={inUse} />
      <LockDateForm key={lockDate ?? ""} lockDate={lockDate} />
    </>
  );
}
