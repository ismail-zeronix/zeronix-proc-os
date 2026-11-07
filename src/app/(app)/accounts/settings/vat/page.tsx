import { eq } from "drizzle-orm";
import { VatForm } from "@/components/settings-ui";
import { schema } from "@/db";
import { requireAccountant } from "@/lib/auth/session";
import { ensureLedger } from "@/lib/ledger/setup";
import { currentOrgId, orgProfile, withOrg } from "@/lib/org";
import { EMIRATES } from "@/lib/sales";

export const metadata = { title: "VAT registration · Zeronix Accounts" };

const emirates = EMIRATES.filter((e) => e !== "Outside UAE").map((e) => ({ value: e.toLowerCase().replace(/ /g, "_"), label: e }));

export default async function VatSettingsPage() {
  await requireAccountant();
  const orgId = await currentOrgId();
  const [org, s] = await Promise.all([
    orgProfile(orgId),
    withOrg(orgId, async (tx) => {
      await ensureLedger(tx, orgId);
      return (await tx.select().from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId)))[0];
    }),
  ]);
  return <VatForm key={`${org.taxRegNo}|${org.emirate}|${s?.vatPeriodMonths}|${s?.vatPeriodStartMonth}`} emirates={emirates} initial={{ trn: org.taxRegNo, emirate: org.emirate, vatPeriodMonths: s?.vatPeriodMonths ?? 3, vatPeriodStartMonth: s?.vatPeriodStartMonth ?? 1 }} />;
}
