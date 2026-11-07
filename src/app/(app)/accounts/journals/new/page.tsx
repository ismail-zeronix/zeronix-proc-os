import { BackButton } from "@/components/back-button";
import { JournalForm } from "@/components/ledger-ui";
import { requireAccountant } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { partyOptions, postableAccounts } from "@/lib/ledger/data";
import { currentOrgId } from "@/lib/org";

export const metadata = { title: "New journal · Zeronix Accounts" };

/** A journal posted by hand: accruals, corrections, owner money, depreciation. */
export default async function NewJournalPage() {
  await requireAccountant();
  const orgId = await currentOrgId();
  const [accounts, parties] = await Promise.all([postableAccounts(orgId), partyOptions(orgId)]);
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <BackButton fallback="/accounts/journals" />
        <h1 className="text-sm font-semibold">New journal</h1>
        <span className="text-xs text-muted-foreground">Debits on the left, credits on the right; both columns must add up to the same.</span>
      </div>
      <JournalForm accounts={accounts} parties={parties} today={dubaiToday()} />
    </div>
  );
}
