import Link from "next/link";
import { OpeningInvoiceDialog } from "@/components/opening-ui";
import { PageToolbar } from "@/components/page-toolbar";
import { Empty } from "@/components/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCustomers } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Customers · Zeronix Accounts" };

/**
 * Customers: every company with a won deal or an order (leads stay in CRM › Companies). What each owes, how much is
 * late, and when they last paid. Biggest overdue first.
 */
export default async function CustomersPage() {
  const access = await requireApp("accounts");
  const { finance } = access;
  const rows = await listCustomers(financeViewerOf(access));
  const owed = rows.reduce((s, c) => s + c.owed, 0);

  return (
    <div className="grid gap-3">
      <PageToolbar title="Customers" meta={`${rows.length} customer${rows.length === 1 ? "" : "s"}${owed ? ` · owe ${money(owed)}` : ""} · open one for its documents and statement`}>
        {finance && (
          <div className="ml-auto">
            <OpeningInvoiceDialog />
          </div>
        )}
      </PageToolbar>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Customer</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Orders</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Invoices</TableHead>
              <TableHead className="text-right">Owes</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
              <TableHead className="hidden md:table-cell">Last paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-72 py-1.5">
                  <Link href={`/accounts/customers/${c.id}`} className="block truncate font-medium hover:underline">
                    {c.name}
                  </Link>
                  <div className="truncate text-xs text-muted-foreground">{[c.emirate, c.trn ? `TRN ${c.trn}` : "no TRN"].filter(Boolean).join(" · ")}</div>
                </TableCell>
                <TableCell className="hidden py-1.5 text-right tabular-nums sm:table-cell">{c.orders}</TableCell>
                <TableCell className="hidden py-1.5 text-right tabular-nums sm:table-cell">{c.invoices}</TableCell>
                <TableCell className="py-1.5 text-right font-medium tabular-nums">{c.owed ? money(c.owed) : "-"}</TableCell>
                <TableCell className={`py-1.5 text-right tabular-nums ${c.overdue ? "font-medium text-red-700 dark:text-red-400" : ""}`}>{c.overdue ? money(c.overdue) : "-"}</TableCell>
                <TableCell className="hidden py-1.5 text-xs md:table-cell">{c.lastPaid ? longDay(c.lastPaid) : "-"}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>No customers yet. A company becomes a customer when its deal is won.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
