import { eq } from "drizzle-orm";
import { VatPeriodForm } from "@/components/settings-ui";
import { schema } from "@/db";
import { requireAccountant } from "@/lib/auth/session";
import { ensureLedger } from "@/lib/ledger/setup";
import { currentOrgId, orgProfile, withOrg } from "@/lib/org";
import { EMIRATES } from "@/lib/sales";

export const metadata = { title: "VAT period · Zeronix Accounts" };

const emirateLabel = (key: string) => EMIRATES.find((e) => e.toLowerCase().replace(/ /g, "_") === key) ?? key;

export default async function VatSettingsPage() {
  const access = await requireAccountant();
  const orgId = await currentOrgId();
  const [org, s] = await Promise.all([
    orgProfile(orgId),
    withOrg(orgId, async (tx) => {
      await ensureLedger(tx, orgId);
      return (await tx.select().from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId)))[0];
    }),
  ]);
  return (
    <VatPeriodForm
      key={`${s?.vatPeriodMonths}|${s?.vatPeriodStartMonth}`}
      initial={{ vatPeriodMonths: s?.vatPeriodMonths ?? 3, vatPeriodStartMonth: s?.vatPeriodStartMonth ?? 1 }}
      trn={org.taxRegNo}
      emirate={emirateLabel(org.emirate)}
      canEditTrn={access.user.role === "admin"}
    />
  );
}
