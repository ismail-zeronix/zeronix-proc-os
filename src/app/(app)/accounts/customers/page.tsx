import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { Empty } from "@/components/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listInvoices, listPayments } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { longDay, money, round2 } from "@/lib/quotation";

export const metadata = { title: "Customers · Zeronix Accounts" };

/** Customers who were invoiced: what each owes, how much is late, and when they last paid. Biggest balance first. */
export default async function CustomersPage() {
  await requireApp("accounts");
  const [invoices, payments] = await Promise.all([listInvoices(), listPayments(5000)]);
  const byCompany = new Map<number, { id: number; name: string; invoices: number; owed: number; overdue: number; lastPaid: string | null }>();
  for (const i of invoices) {
    const c = byCompany.get(i.companyId) ?? { id: i.companyId, name: i.customerName, invoices: 0, owed: 0, overdue: 0, lastPaid: null };
    if (i.status !== "cancelled") c.invoices++;
    c.owed = round2(c.owed + i.state.balance);
    if (i.state.key === "overdue") c.overdue = round2(c.overdue + i.state.balance);
    byCompany.set(i.companyId, c);
  }
  for (const p of payments) {
    const c = byCompany.get(p.companyId);
    if (c && !p.voidedAt && (!c.lastPaid || p.paidOn > c.lastPaid)) c.lastPaid = p.paidOn;
  }
  const rows = [...byCompany.values()].sort((a, b) => b.overdue - a.overdue || b.owed - a.owed || a.name.localeCompare(b.name));

  return (
    <div className="grid gap-3">
      <PageToolbar title="Customers" meta={`${rows.length} invoiced · open one for its statement of account`} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Invoices</TableHead>
              <TableHead className="text-right">Owes</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
              <TableHead className="hidden sm:table-cell">Last paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-72 py-1.5">
                  <Link href={`/accounts/customers/${c.id}`} className="block truncate font-medium hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{c.invoices}</TableCell>
                <TableCell className="py-1.5 text-right font-medium tabular-nums">{c.owed ? money(c.owed) : "-"}</TableCell>
                <TableCell className={`py-1.5 text-right tabular-nums ${c.overdue ? "font-medium text-red-700 dark:text-red-400" : ""}`}>{c.overdue ? money(c.overdue) : "-"}</TableCell>
                <TableCell className="hidden py-1.5 text-xs sm:table-cell">{c.lastPaid ? longDay(c.lastPaid) : "-"}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Empty>No customer has been invoiced yet.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
