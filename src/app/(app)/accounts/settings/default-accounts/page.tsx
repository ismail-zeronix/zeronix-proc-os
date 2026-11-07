import { asc, eq } from "drizzle-orm";
import { AccountMapForm } from "@/components/settings-ui";
import { schema } from "@/db";
import { requireAccountant } from "@/lib/auth/session";
import { MAPPABLE_KEYS } from "@/lib/ledger/settings-rules";
import { ensureLedger } from "@/lib/ledger/setup";
import { currentOrgId, withOrg } from "@/lib/org";

export const metadata = { title: "Posting accounts · Zeronix Accounts" };

export default async function DefaultAccountsPage() {
  await requireAccountant();
  const orgId = await currentOrgId();
  const { accounts, map } = await withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const a = schema.ledgerAccounts;
    const list = await tx.select({ id: a.id, code: a.code, name: a.name, type: a.type, isGroup: a.isGroup, isActive: a.isActive, systemKey: a.systemKey }).from(a).where(eq(a.organizationId, orgId)).orderBy(asc(a.code));
    const [s] = await tx.select({ m: schema.accountingSettings.accountMap }).from(schema.accountingSettings).where(eq(schema.accountingSettings.organizationId, orgId));
    return { accounts: list, map: s?.m ?? {} };
  });
  const rows = MAPPABLE_KEYS.map((k) => ({ ...k, accountId: map[k.key] ?? null, usualId: accounts.find((a) => a.systemKey === k.key)?.id ?? null }));
  return <AccountMapForm rows={rows} accounts={accounts.filter((a) => a.isActive)} />;
}
