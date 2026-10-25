import { Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { InvoiceStateBadge } from "@/components/order-bits";
import { PayBillDialog, VoidBillButton, VoidSupplierPaymentButton } from "@/components/purchases-ui";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { requireFinance } from "@/lib/auth/session";
import { methodLabel, termsLabel } from "@/lib/invoicing";
import { billKindLabel, categoryLabel, lineCost } from "@/lib/purchases";
import { getBill } from "@/lib/purchases-data";
import { longDay, money } from "@/lib/quotation";

export async function generateMetadata({ params }: PageProps<"/accounts/bills/[id]">) {
  await requireFinance();
  const b = await getBill(Number((await params).id)).catch(() => null);
  return { title: `${b?.number ?? "Bill"} · Zeronix Accounts` };
}

/** One bill or expense: who, what for, the lines, what is paid and what is still to pay. */
export default async function BillPage({ params }: PageProps<"/accounts/bills/[id]">) {
  await requireFinance();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const b = await getBill(id);
  if (!b) notFound();
  const expense = b.kind === "expense";
  const live = b.payments.filter((p) => !p.voidedAt);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback={expense ? "/accounts/expenses" : "/accounts/bills"} />
        <h1 className="font-mono text-lg font-semibold tracking-tight">{b.number}</h1>
        <InvoiceStateBadge state={b.state} />
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {billKindLabel(b.kind)} ·{" "}
          {b.supplierId ? (
            <Link href={`/accounts/suppliers/${b.supplierId}`} className="hover:text-foreground hover:underline">
              {b.payee}
            </Link>
          ) : (
            b.payee
          )}
          {b.supplierRef ? ` · their no. ${b.supplierRef}` : ""}
        </span>
        {b.status !== "void" && b.state.balance > 0 && !expense && <PayBillDialog billId={b.id} number={b.number} balance={b.state.balance} billDate={b.billDate} />}
        {b.status !== "void" && (expense || !live.length) && <VoidBillButton billId={b.id} number={b.number} expense={expense} />}
      </div>
      {b.status === "void" && <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">Voided: {b.voidReason}</p>}

      <StatStrip
        items={[
          { label: "Total with VAT", value: money(b.total), hint: `${money(b.subtotal)} + VAT ${money(b.vatAmount)}` },
          { label: "Paid", value: money(b.state.paid), hint: `${live.length} payment${live.length === 1 ? "" : "s"}` },
          { label: "Still to pay", value: money(b.state.balance), hint: b.state.label },
          { label: expense ? "Paid on" : "Due date", value: longDay(b.dueDate), hint: expense ? categoryLabel(b.category) : `${termsLabel(b.termsDays)} from ${longDay(b.billDate)}` },
        ]}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {b.items.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{l.description}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.qty}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(l.unitCost)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{money(lineCost(l))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-xs">
              <tr className="border-t">
                <td colSpan={3} className="px-3 py-1 text-right text-muted-foreground">
                  Subtotal
                </td>
                <td className="px-3 py-1 text-right tabular-nums">{money(b.subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-3 py-1 text-right text-muted-foreground">
                  VAT {b.vatPct}%
                </td>
                <td className="px-3 py-1 text-right tabular-nums">{money(b.vatAmount)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-3 py-1 text-right font-medium">
                  Total
                </td>
                <td className="px-3 py-1 text-right font-semibold tabular-nums">{money(b.total)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <aside className="grid gap-3">
          <section className="rounded-xl border bg-card">
            <h2 className="border-b px-3 py-2 text-sm font-medium">Payments</h2>
            <ul className="divide-y">
              {b.payments.map((p) => (
                <li key={p.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${p.voidedAt ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className={`font-mono text-xs font-medium ${p.voidedAt ? "line-through" : ""}`}>{p.number}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {longDay(p.paidOn)} · {methodLabel(p.method)}
                      {p.reference ? ` · ${p.reference}` : ""}
                      {p.voidedAt ? ` · void: ${p.voidReason}` : ""}
                    </div>
                  </div>
                  <span className="tabular-nums">{money(p.amount)}</span>
                  <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/print/payment-voucher/${p.id}`} target="_blank" />} aria-label="Print the payment voucher" title="Payment voucher">
                    <Printer />
                  </Button>
                  {!p.voidedAt && !expense && <VoidSupplierPaymentButton paymentId={p.id} number={p.number} />}
                </li>
              ))}
              {!b.payments.length && <li className="px-3 py-4 text-center text-xs text-muted-foreground">Not paid yet.</li>}
            </ul>
          </section>
          <section className="grid gap-1.5 rounded-xl border bg-card p-3 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Category</span>
              <span>{categoryLabel(b.category)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Bill date</span>
              <span>{longDay(b.billDate)}</span>
            </div>
            {b.order && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">For order</span>
                <Link href={`/sales/orders/${b.order.id}`} className="truncate font-mono hover:underline">
                  {b.order.number} · {b.order.companyName}
                </Link>
              </div>
            )}
            {b.author && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Entered by</span>
                <span>{b.author}</span>
              </div>
            )}
            {b.notes && <p className="border-t pt-1.5 whitespace-pre-line">{b.notes}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
