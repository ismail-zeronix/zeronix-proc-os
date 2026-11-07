import { eq } from "drizzle-orm";
import { MoneyForm } from "@/components/money-form";
import { db, schema } from "@/db";
import { requireFinance } from "@/lib/auth/session";
import { bankAccountOptions } from "@/lib/ledger/data";
import { currentOrgId } from "@/lib/org";
import { param } from "@/lib/sales-base";

export const metadata = { title: "New receipt · Zeronix Accounts" };

/** Money received from a customer, across any of their open invoices. `?company=` starts with that customer, `?invoice=` ticks one. */
export default async function NewReceiptPage({ searchParams }: PageProps<"/accounts/payments/new">) {
  await requireFinance();
  const sp = await searchParams;
  const companyId = Number(param(sp.company)) || 0;
  const [company] = companyId ? await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, companyId)) : [];
  const accounts = await bankAccountOptions(await currentOrgId());
  return <MoneyForm party="customer" accounts={accounts} initial={company ?? null} preselect={Number(param(sp.invoice)) || undefined} />;
}
