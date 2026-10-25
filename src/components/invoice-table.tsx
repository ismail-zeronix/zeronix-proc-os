import Link from "next/link";
import { InvoiceStateBadge } from "@/components/order-bits";
import { Empty } from "@/components/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import type { InvoiceRow } from "@/lib/accounts-data";
import { longDay, money } from "@/lib/quotation";

/**
 * Invoices with what is still owed and how late. Used by Accounts overview, the invoices list and a customer page.
 * Below the finance level an invoice opens as its printable copy (the invoice page is for the accounts team).
 */
export function InvoiceTable({ rows, empty, showCustomer = true, finance = true }: { rows: InvoiceRow[]; empty: string; showCustomer?: boolean; finance?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead>Invoice</TableHead>
            {showCustomer && <TableHead>Customer</TableHead>}
            <TableHead className="hidden md:table-cell">Due</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Owed</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Owner</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((i) => (
            <TableRow key={i.id} className={i.state.key === "cancelled" ? "opacity-60" : ""}>
              <TableCell className="py-1.5">
                <Link href={finance ? `/accounts/invoices/${i.id}` : `/print/invoice/${i.id}`} target={finance ? undefined : "_blank"} className="font-mono text-sm font-medium hover:underline">
                  {i.number}
                </Link>
                <div className="text-xs text-muted-foreground">{longDay(i.issueDate)}</div>
              </TableCell>
              {showCustomer && (
                <TableCell className="max-w-64 py-1.5">
                  <Link href={`/accounts/customers/${i.companyId}`} className="block truncate font-medium hover:underline">
                    {i.customerName}
                  </Link>
                </TableCell>
              )}
              <TableCell className="hidden py-1.5 text-xs whitespace-nowrap md:table-cell">{longDay(i.dueDate)}</TableCell>
              <TableCell className="py-1.5 text-right tabular-nums">{money(i.total)}</TableCell>
              <TableCell className="py-1.5 text-right font-medium tabular-nums">{i.state.balance > 0 ? money(i.state.balance) : "-"}</TableCell>
              <TableCell className="py-1.5">
                <InvoiceStateBadge state={i.state} />
              </TableCell>
              <TableCell className="hidden py-1.5 lg:table-cell">{i.ownerName ? <UserAvatar name={i.ownerName} size={24} /> : "-"}</TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={showCustomer ? 7 : 6}>
                <Empty>{empty}</Empty>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
