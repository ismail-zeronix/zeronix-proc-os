import { Printer } from "lucide-react";
import Link from "next/link";
import { PageToolbar } from "@/components/page-toolbar";
import { VoidSupplierPaymentButton } from "@/components/purchases-ui";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { methodLabel } from "@/lib/invoicing";
import { categoryLabel } from "@/lib/purchases";
import { listSupplierPayments } from "@/lib/purchases-data";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Payments made · Zeronix Accounts" };

/** Every payment voucher: supplier bills and expenses paid, newest first. */
export default async function PaymentsMadePage() {
  await requireFinance();
  const rows = await listSupplierPayments({ limit: 500 });
  const month = dubaiToday().slice(0, 7);
  const thisMonth = rows.filter((p) => !p.voidedAt && p.paidOn.startsWith(month)).reduce((s, p) => s + p.amount, 0);

  return (
    <div className="grid gap-3">
      <PageToolbar title="Payments made" meta={`${money(thisMonth)} paid out this month`} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Voucher</TableHead>
              <TableHead>Paid to</TableHead>
              <TableHead className="hidden md:table-cell">For</TableHead>
              <TableHead className="hidden sm:table-cell">Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-20">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} className={p.voidedAt ? "opacity-60" : ""}>
                <TableCell className="py-1.5">
                  <span className={`font-mono text-sm font-medium ${p.voidedAt ? "line-through" : ""}`}>{p.number}</span>
                  <div className="text-xs text-muted-foreground">{longDay(p.paidOn)}</div>
                </TableCell>
                <TableCell className="max-w-64 py-1.5">
                  <div className="truncate font-medium">{p.payee}</div>
                  {p.voidedAt && <div className="truncate text-xs text-destructive">Void: {p.voidReason}</div>}
                </TableCell>
                <TableCell className="hidden py-1.5 text-xs md:table-cell">
                  <Link href={`/accounts/bills/${p.billId}`} className="font-mono hover:underline">
                    {p.billNumber}
                  </Link>
                  <div className="text-muted-foreground">{p.billKind === "expense" ? categoryLabel(p.category) : p.supplierRef ? `their no. ${p.supplierRef}` : ""}</div>
                </TableCell>
                <TableCell className="hidden py-1.5 text-xs sm:table-cell">
                  {methodLabel(p.method)}
                  {p.reference && <div className="text-muted-foreground">{p.reference}</div>}
                </TableCell>
                <TableCell className="py-1.5 text-right font-medium tabular-nums">{money(p.amount)}</TableCell>
                <TableCell className="py-1.5 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/print/payment-voucher/${p.id}`} target="_blank" />} aria-label="Print the payment voucher" title="Payment voucher">
                    <Printer />
                  </Button>
                  {!p.voidedAt && p.billKind !== "expense" && <VoidSupplierPaymentButton paymentId={p.id} number={p.number} />}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>No payments made yet. Pay a bill from its page, or record an expense.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
