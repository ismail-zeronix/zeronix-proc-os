import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listPayments } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { methodLabel } from "@/lib/invoicing";
import { longDay, money, round2 } from "@/lib/quotation";

export const metadata = { title: "Payments · Zeronix Accounts" };

/** Every receipt, newest first. Voided ones stay on the list, crossed out. */
export default async function PaymentsPage() {
  await requireApp("accounts");
  const rows = await listPayments();
  const live = rows.filter((p) => !p.voidedAt);
  const total = (m: string) => round2(live.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0));
  return (
    <div className="grid gap-3">
      <PageToolbar title="Payments" meta={`${live.length} received · cash ${money(total("cash"))} · bank ${money(total("bank"))}`} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Receipt</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden sm:table-cell">Invoice</TableHead>
              <TableHead className="hidden md:table-cell">Paid by</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Receipt</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} className={p.voidedAt ? "text-muted-foreground" : ""}>
                <TableCell className="py-1.5">
                  <span className={`font-mono text-sm ${p.voidedAt ? "line-through" : "font-medium"}`}>{p.number}</span>
                  <div className="text-xs text-muted-foreground">
                    {longDay(p.paidOn)}
                    {p.voidedAt ? " · voided" : ""}
                  </div>
                </TableCell>
                <TableCell className="max-w-64 py-1.5">
                  <Link href={`/accounts/customers/${p.companyId}`} className="block truncate font-medium hover:underline">
                    {p.customerName}
                  </Link>
                </TableCell>
                <TableCell className="hidden py-1.5 sm:table-cell">
                  <Link href={`/accounts/invoices/${p.invoiceId}`} className="font-mono text-xs hover:underline">
                    {p.invoiceNumber}
                  </Link>
                </TableCell>
                <TableCell className="hidden py-1.5 text-xs md:table-cell">
                  {methodLabel(p.method)}
                  {p.reference && <div className="text-muted-foreground">{p.reference}</div>}
                </TableCell>
                <TableCell className={`py-1.5 text-right tabular-nums ${p.voidedAt ? "line-through" : "font-medium"}`}>{money(p.amount)}</TableCell>
                <TableCell className="py-1.5">
                  <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/print/receipt/${p.id}`} target="_blank" />} aria-label={`Receipt ${p.number}`} title="Receipt voucher">
                    <ReceiptText />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>No payments yet. Record one from an invoice.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
