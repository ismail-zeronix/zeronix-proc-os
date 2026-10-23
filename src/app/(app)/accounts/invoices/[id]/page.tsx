import { FileMinus, Printer, ReceiptText } from "lucide-react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { FileTable, UploadDialog } from "@/components/files-ui";
import { InvoiceStateBadge } from "@/components/order-bits";
import { CancelInvoiceButton, RecordPaymentDialog, VoidPaymentButton } from "@/components/order-ui";
import { SalesDocument } from "@/components/sales-document";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { getInvoice } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { invoiceDoc } from "@/lib/doc-views";
import { listFiles } from "@/lib/files-data";
import { methodLabel, termsLabel } from "@/lib/invoicing";
import { longDay, money } from "@/lib/quotation";
import { quoteBrand } from "@/lib/quote-view";

export async function generateMetadata({ params }: PageProps<"/accounts/invoices/[id]">) {
  const inv = await getInvoice(Number((await params).id)).catch(() => null);
  return { title: `${inv?.number ?? "Invoice"} · Zeronix Accounts` };
}

/** One tax invoice: what is owed and by when, the payments with their receipts, and the document as the customer sees it. */
export default async function InvoicePage({ params }: PageProps<"/accounts/invoices/[id]">) {
  const access = await requireApp("accounts");
  const { user, apps } = access;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const inv = await getInvoice(id);
  if (!inv) notFound();
  const canFiles = apps.includes("files");
  const [brand, doc, files] = await Promise.all([quoteBrand(), invoiceDoc(inv), canFiles ? listFiles(financeViewerOf(access), { relatedType: "invoice", relatedId: inv.id }) : Promise.resolve([])]);
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
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/invoice/${inv.id}`} target="_blank" />}>
          <Printer /> Print / PDF
        </Button>
        {inv.credit && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/invoice/${inv.id}?doc=credit`} target="_blank" />}>
            <FileMinus /> Credit note {inv.credit.number}
          </Button>
        )}
        {inv.status !== "cancelled" && s.balance > 0 && <RecordPaymentDialog invoiceId={inv.id} invoiceNumber={inv.number} balance={s.balance} issueDate={inv.issueDate} />}
        {inv.status !== "cancelled" && <CancelInvoiceButton invoiceId={inv.id} number={inv.number} />}
      </div>

      {inv.credit && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm">
          Cancelled with credit note {inv.credit.number} on {longDay(inv.credit.issueDate)}: {inv.credit.reason}. Issue a corrected invoice from the order (To invoice).
        </p>
      )}

      <StatStrip
        items={[
          { label: "Total with VAT", value: money(inv.total), hint: `${money(inv.subtotal)} + VAT ${money(inv.vatAmount)}` },
          { label: "Paid", value: money(s.paid), hint: `${live.length} payment${live.length === 1 ? "" : "s"}` },
          { label: "Still owed", value: money(s.balance), hint: s.label },
          { label: "Due date", value: longDay(inv.dueDate), hint: `${termsLabel(inv.termsDays)} from ${longDay(inv.issueDate)}` },
        ]}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-hidden rounded-xl border bg-card" aria-label="The invoice the customer receives">
          <SalesDocument d={doc} brand={brand} />
        </section>
        <aside className="grid gap-3">
          <section className="rounded-xl border bg-card">
            <h2 className="border-b px-3 py-2 text-sm font-medium">Payments</h2>
            {inv.payments.length ? (
              <ul className="divide-y">
                {inv.payments.map((p) => (
                  <li key={p.id} className={`flex items-start gap-2 px-3 py-2 text-sm ${p.voidedAt ? "text-muted-foreground" : ""}`}>
                    <div className="grid min-w-0 flex-1 leading-tight">
                      <span className={`font-medium tabular-nums ${p.voidedAt ? "line-through" : ""}`}>{money(p.amount)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {longDay(p.paidOn)} · {methodLabel(p.method)}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.number}
                        {p.byName ? ` · by ${p.byName}` : ""}
                      </span>
                      {p.voidedAt && <span className="text-xs text-red-700 dark:text-red-400">Voided: {p.voidReason}</span>}
                    </div>
                    <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/print/receipt/${p.id}`} target="_blank" />} aria-label={`Receipt ${p.number}`} title="Receipt voucher">
                      <ReceiptText />
                    </Button>
                    {!p.voidedAt && <VoidPaymentButton paymentId={p.id} number={p.number} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-4 text-sm text-muted-foreground">No payment yet.</p>
            )}
          </section>
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
          <p className="px-1 text-xs text-muted-foreground">
            Issued by {inv.author?.name ?? "-"}. An issued invoice cannot be edited: cancel it (credit note) and issue a corrected one.
          </p>
        </aside>
      </div>
    </div>
  );
}
