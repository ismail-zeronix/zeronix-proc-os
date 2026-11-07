import { FileMinus, Plus, Printer, ReceiptText } from "lucide-react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { FileTable, UploadDialog } from "@/components/files-ui";
import { InvoiceStateBadge } from "@/components/order-bits";
import { ApplyAdvanceDialog, RefundAdvanceDialog, RemoveAllocationButton } from "@/components/allocation-ui";
import { NoteDialog } from "@/components/note-ui";
import { CancelInvoiceButton, RecordPaymentDialog, VoidPaymentButton } from "@/components/order-ui";
import { SalesDocument } from "@/components/sales-document";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { customerAdvances, getInvoice } from "@/lib/accounts-data";
import { requireFinance } from "@/lib/auth/session";
import { LedgerEntries } from "@/components/ledger-entries";
import { financeViewerOf } from "@/lib/auth/visibility";
import { invoiceDoc } from "@/lib/doc-views";
import { bankAccountOptions } from "@/lib/ledger/data";
import { soldCostOf } from "@/lib/ledger/documents";
import { currentOrgId, withOrg } from "@/lib/org";
import { listFiles } from "@/lib/files-data";
import { methodLabel, termsLabel } from "@/lib/invoicing";
import { invoiceCosts, orderCosts } from "@/lib/purchases-data";
import { longDay, money, round2 } from "@/lib/quotation";
import { quoteBrand } from "@/lib/quote-view";
import { FitWidth } from "@/components/fit-width";

export async function generateMetadata({ params }: PageProps<"/accounts/invoices/[id]">) {
  const inv = await getInvoice(Number((await params).id)).catch(() => null);
  return { title: `${inv?.number ?? "Invoice"} · Zeronix Accounts` };
}

/** One tax invoice: what is owed and by when, the payments with their receipts, and the document as the customer sees it. */
export default async function InvoicePage({ params, searchParams }: PageProps<"/accounts/invoices/[id]">) {
  const access = await requireFinance();
  const { user, apps } = access;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const inv = await getInvoice(id);
  if (!inv) notFound();
  const canFiles = apps.includes("files");
  const opening = inv.kind === "opening";
  const orgId = await currentOrgId();
  const [brand, doc, files, advances, costs, accounts, soldCost] = await Promise.all([
    quoteBrand(),
    invoiceDoc(inv),
    canFiles ? listFiles(financeViewerOf(access), { relatedType: "invoice", relatedId: inv.id, finance: true }) : Promise.resolve([]),
    (inv.status !== "cancelled" && inv.state.balance > 0) || inv.credits.length > 0 ? customerAdvances(inv.companyId) : Promise.resolve([]),
    opening ? Promise.resolve(null) : inv.orderId ? orderCosts(inv.orderId) : invoiceCosts(inv.id),
    bankAccountOptions(orgId),
    opening ? Promise.resolve(0) : withOrg(orgId, (tx) => soldCostOf(tx, orgId, inv.id)),
  ]);
  const s = inv.state;
  const live = inv.payments.filter((p) => !p.voidedAt);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/accounts/invoices" />
        <h1 className="font-mono text-lg font-semibold tracking-tight">{inv.number}</h1>
        <InvoiceStateBadge state={s} />
        <Link href={`/accounts/customers/${inv.companyId}`} className="min-w-0 flex-1 truncate text-sm text-muted-foreground hover:text-foreground hover:underline">
          {inv.customerName}
          {inv.order ? ` · order ${inv.order.number}` : ""}
        </Link>
        {!opening && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/invoice/${inv.id}`} target="_blank" />}>
            <Printer /> Print / PDF
          </Button>
        )}
        {inv.credits.length > 0 && advances.length > 0 && <RefundAdvanceDialog party="customer" advances={advances} accounts={accounts} />}
        {advances.length > 0 && inv.status !== "cancelled" && s.balance > 0 && <ApplyAdvanceDialog party="customer" advances={advances} documents={[{ id: inv.id, number: inv.number, issueDate: inv.issueDate, balance: s.balance }]} />}
        {inv.status !== "cancelled" && s.balance > 0 && <RecordPaymentDialog invoiceId={inv.id} invoiceNumber={inv.number} balance={s.balance} issueDate={inv.issueDate} accounts={accounts} />}
        {inv.status !== "cancelled" && !opening && (
          <NoteDialog
            party="customer"
            documentId={inv.id}
            number={inv.number}
            documentDate={inv.issueDate}
            lines={inv.lines.map((l) => ({ id: l.id, description: l.description, qty: l.qty, unitPrice: l.unitPrice, taxCode: l.taxCode, left: l.left, isProduct: l.lineKind === "product" }))}
            vatLeft={round2(inv.vatAmount - inv.credits.reduce((n, c) => n + c.vatAmount, 0))}
            valueLeft={round2(inv.total - inv.creditedTotal)}
            paid={s.paid}
            soldCost={soldCost}
            defaultOpen={(await searchParams).credit === "1"}
          />
        )}
        {inv.status !== "cancelled" && <CancelInvoiceButton invoiceId={inv.id} number={inv.number} opening={opening} />}
      </div>

      {advances.length > 0 && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          {inv.customerName} has {money(advances.reduce((n, a) => n + a.left, 0))} paid in advance. {s.balance > 0 && inv.status !== "cancelled" ? "Use Apply advance to set it against this invoice" : "Set it against another invoice"}{inv.credits.length > 0 ? ", or use Refund to hand it back." : "."}
        </p>
      )}
      {inv.status === "cancelled" && !opening && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm">
          Cancelled by credit note. {inv.orderId ? "Issue a corrected invoice from the order (Orders › To invoice)." : "Make a new invoice if it needs correcting."}
        </p>
      )}

      <StatStrip
        items={[
          { label: "Total with VAT", value: money(inv.total), hint: inv.creditedTotal > 0 ? `${money(inv.creditedTotal)} credited` : `${money(inv.subtotal)} + VAT ${money(inv.vatAmount)}` },
          { label: "Paid", value: money(s.paid), hint: `${live.length} payment${live.length === 1 ? "" : "s"}` },
          { label: "Still owed", value: money(s.balance), hint: s.label },
          { label: "Due date", value: longDay(inv.dueDate), hint: `${termsLabel(inv.termsDays)} from ${longDay(inv.issueDate)}` },
        ]}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-x-auto rounded-xl border bg-card" aria-label="The invoice the customer receives">
          {opening ? (
            <p className="p-6 text-sm text-muted-foreground">
              Opening balance carried over from Zoho: the tax invoice itself is in Zoho. It counts in what the customer owes, not in this year&apos;s sales or VAT.
            </p>
          ) : (
            // phones: the paper layout scaled down, like a PDF preview
            <FitWidth>
              <SalesDocument d={doc} brand={brand} />
            </FitWidth>
          )}
        </section>
        <aside className="grid gap-3">
          <section className="rounded-xl border bg-card">
            <h2 className="border-b px-3 py-2 text-sm font-medium">Payments</h2>
            {inv.payments.length ? (
              <ul className="divide-y">
                {inv.payments.map((p) => (
                  <li key={p.allocationId} className={`flex items-start gap-2 px-3 py-2 text-sm ${p.voidedAt ? "text-muted-foreground" : ""}`}>
                    <div className="grid min-w-0 flex-1 leading-tight">
                      <span className={`font-medium tabular-nums ${p.voidedAt ? "line-through" : ""}`}>
                        {money(p.amount)}
                        {p.receiptTotal !== p.amount && <span className="ml-1 text-xs font-normal text-muted-foreground">of {money(p.receiptTotal)}</span>}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {longDay(p.appliedOn)}
                        {p.appliedOn !== p.paidOn ? ` · advance from ${longDay(p.paidOn)}` : ""} · {methodLabel(p.method)}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.number}
                        {p.byName ? ` · by ${p.byName}` : ""}
                      </span>
                      {p.paymentVoided && <span className="text-xs text-red-700 dark:text-red-400">Voided: {p.voidReason}</span>}
                      {p.voidedAt && !p.paymentVoided && <span className="text-xs text-muted-foreground">Taken off, kept as an advance</span>}
                    </div>
                    <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/print/receipt/${p.id}`} target="_blank" />} aria-label={`Receipt ${p.number}`} title="Receipt voucher">
                      <ReceiptText />
                    </Button>
                    {!p.voidedAt && <RemoveAllocationButton party="customer" allocationId={p.allocationId} number={p.number} documentNumber={inv.number} />}
                    {!p.paymentVoided && !p.voidedAt && <VoidPaymentButton paymentId={p.id} number={p.number} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-4 text-sm text-muted-foreground">No payment yet.</p>
            )}
          </section>
          {inv.credits.length > 0 && (
            <section className="rounded-xl border bg-card">
              <h2 className="border-b px-3 py-2 text-sm font-medium">Credit notes</h2>
              <ul className="divide-y">
                {inv.credits.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                    <div className="grid min-w-0 flex-1 leading-tight">
                      <span className="font-medium tabular-nums">{money(c.total)}</span>
                      <span className="truncate text-xs text-muted-foreground" title={c.reason}>
                        {longDay(c.issueDate)} · {c.reason}
                      </span>
                      <span className="text-xs text-muted-foreground">{c.number}</span>
                    </div>
                    <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/print/invoice/${inv.id}?doc=credit&cn=${c.id}`} target="_blank" />} aria-label={`Credit note ${c.number}`} title="Credit note">
                      <FileMinus />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {costs && (
            <section className="rounded-xl border bg-card">
              <div className="flex items-center gap-2 border-b px-3 py-1.5">
                <h2 className="text-sm font-medium">What it cost</h2>
                {inv.status !== "cancelled" && (
                  <Button variant="ghost" size="xs" className="ml-auto" nativeButton={false} render={<Link href={inv.orderId ? `/accounts/bills/new?order=${inv.orderId}` : `/accounts/bills/new?invoice=${inv.id}`} />}>
                    <Plus /> Add bill
                  </Button>
                )}
              </div>
              {costs.bills.length ? (
                <ul className="divide-y text-sm">
                  {costs.bills.map((b) => (
                    <li key={b.id} className="flex justify-between gap-2 px-3 py-1.5">
                      <Link href={`/accounts/bills/${b.id}`} className="truncate text-xs hover:underline">
                        <span className="font-mono">{b.number}</span> · {b.payee}
                      </Link>
                      <span className="tabular-nums">{money(b.subtotal)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between px-3 py-1.5 font-medium">
                    <span>Profit before expenses</span>
                    <span className={`tabular-nums ${inv.subtotal - inv.creditedNet - costs.cost < 0 ? "text-destructive" : ""}`}>{money(inv.subtotal - inv.creditedNet - costs.cost)}</span>
                  </li>
                </ul>
              ) : (
                <p className="px-3 py-3 text-xs text-muted-foreground">No supplier bill is linked to this sale yet, so its profit looks too high.</p>
              )}
            </section>
          )}
          {canFiles && (
            <section className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center gap-2 border-b px-3 py-1.5">
                <h2 className="text-sm font-medium">Files</h2>
                <span className="text-xs text-muted-foreground">e.g. transfer proof</span>
                <div className="ml-auto">
                  <UploadDialog folder="invoices" related={{ type: "invoice", id: inv.id }} relatedLabel={inv.number} />
                </div>
              </div>
              <FileTable rows={files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))} meId={user.id} isAdmin={user.role === "admin"} showFolder={false} empty="No files." />
            </section>
          )}
          {access.accountant && (
            <LedgerEntries
              refs={[
                { sourceType: "invoice", sourceId: inv.id },
                ...inv.credits.map((c) => ({ sourceType: "credit_note", sourceId: c.id })),
                ...inv.payments.map((p) => ({ sourceType: "receipt", sourceId: p.id })),
                ...inv.payments.map((p) => ({ sourceType: "payment_allocation", sourceId: p.allocationId })),
              ]}
            />
          )}
          <p className="px-1 text-xs text-muted-foreground">
            Issued by {inv.author?.name ?? "-"}. An issued invoice cannot be edited: a credit note gives back part of it, or cancel it and issue a corrected one.
          </p>
        </aside>
      </div>
    </div>
  );
}
