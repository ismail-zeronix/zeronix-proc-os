import { MoneyForm } from "@/components/money-form";
import { requireFinance } from "@/lib/auth/session";
import { bankAccountOptions } from "@/lib/ledger/data";
import { currentOrgId } from "@/lib/org";
import { supplierOptions } from "@/lib/purchases-data";
import { param } from "@/lib/sales-base";

export const metadata = { title: "New voucher · Zeronix Accounts" };

/** Money paid to a supplier, across any of their unpaid bills. `?supplier=` starts with that supplier, `?bill=` ticks one. */
export default async function NewVoucherPage({ searchParams }: PageProps<"/accounts/payments-made/new">) {
  await requireFinance();
  const sp = await searchParams;
  const [suppliers, accounts] = await Promise.all([supplierOptions(), currentOrgId().then(bankAccountOptions)]);
  const picked = suppliers.find((s) => s.id === Number(param(sp.supplier))) ?? null;
  return <MoneyForm party="supplier" accounts={accounts} initial={picked} suppliers={suppliers} preselect={Number(param(sp.bill)) || undefined} />;
}
