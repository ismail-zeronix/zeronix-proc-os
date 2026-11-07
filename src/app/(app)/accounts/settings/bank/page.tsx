import { asc, eq, sql } from "drizzle-orm";
import { BankAccountsList } from "@/components/settings-ui";
import { schema } from "@/db";
import { requireAccountant } from "@/lib/auth/session";
import { ensureLedger } from "@/lib/ledger/setup";
import { currentOrgId, withOrg } from "@/lib/org";

export const metadata = { title: "Bank and cash accounts · Zeronix Accounts" };

export default async function BankSettingsPage() {
  await requireAccountant();
  const orgId = await currentOrgId();
  const rows = await withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const b = schema.bankAccounts;
    return tx
      .select({
        id: b.id,
        name: b.name,
        kind: b.kind,
        bankName: b.bankName,
        accountNumber: b.accountNumber,
        iban: b.iban,
        isDefault: b.isDefault,
        isActive: b.isActive,
        accountCode: schema.ledgerAccounts.code,
        balance: sql<number>`coalesce((SELECT sum(l.debit - l.credit) FROM journal_lines l WHERE l.account_id = ${b.accountId}), 0)::float`,
      })
      .from(b)
      .innerJoin(schema.ledgerAccounts, eq(schema.ledgerAccounts.id, b.accountId))
      .where(eq(b.organizationId, orgId))
      .orderBy(asc(schema.ledgerAccounts.code));
  });
  return <BankAccountsList rows={rows} />;
}
