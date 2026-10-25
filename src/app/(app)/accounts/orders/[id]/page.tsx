import { FileText, Files, ListOrdered, Printer, Receipt, Truck } from "lucide-react";
import Link from "next/link";
import { AppLink } from "@/components/app-link";
import { BackButton } from "@/components/back-button";
import { notFound } from "next/navigation";
import { FileTable, UploadDialog } from "@/components/files-ui";
import { InvoiceStateBadge, OrderStatusBadge } from "@/components/order-bits";
import { CancelOrderButton, EditOrderDialog, IssueInvoiceDialog, MarkDeliveredDialog } from "@/components/order-ui";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UrlTabs } from "@/components/url-tabs";
import { nextInvoiceNumber } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { listFiles } from "@/lib/files-data";
import { termsLabel } from "@/lib/invoicing";
import { getOrder } from "@/lib/orders-data";
import { orderCosts } from "@/lib/purchases-data";
import { getSetting } from "@/lib/settings";
import { lineTotal, longDay, money } from "@/lib/quotation";

export async function generateMetadata({ params }: PageProps<"/accounts/orders/[id]">) {
  const o = await getOrder(Number((await params).id), financeViewerOf(await requireApp("accounts"))).catch(() => null);
  return { title: `${o?.number ?? "Order"} · Zeronix Accounts` };
}

/** One sales order: delivery, invoice and money in one place, with the customer's PO and other files. */
export default async function OrderPage({ params, searchParams }: PageProps<"/accounts/orders/[id]">) {
  const access = await requireApp("accounts");
  const { user, apps } = access;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const o = await getOrder(id, financeViewerOf(access));
  if (!o) notFound();
  const { tab } = await searchParams;
  const canAccounts = access.finance;
  const canFiles = apps.includes("files");
  const [files, nextNumber, ourTrn, costs] = await Promise.all([
    canFiles ? listFiles(financeViewerOf(access), { relatedType: "order", relatedId: o.id }) : Promise.resolve([]),
    canAccounts && o.status === "delivered" ? nextInvoiceNumber() : Promise.resolve(""),
    getSetting("quote_trn"),
    // what it really cost, from the supplier bills bought for it (the accounts team only)
    canAccounts ? orderCosts(o.id) : Promise.resolve(null),
  ]);
  const active = o.invoices.find((i) => i.status !== "cancelled");
  const closed = o.status === "invoiced" || o.status === "cancelled";
  const profit = o.costTotal != null ? o.subtotal - o.costTotal : null;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/accounts/orders" />
        <h1 className="font-mono text-lg font-semibold tracking-tight">{o.number}</h1>
        <OrderStatusBadge status={o.status} />
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={o.deal.title}>
          <Link href={`/accounts/customers/${o.companyId}`} className="hover:text-foreground hover:underline">
            {o.company.name}
          </Link>
          {" · "}
          {apps.includes("crm") ? (
            <AppLink href={`/crm/deals/${o.dealId}`} className="hover:text-foreground hover:underline" title="Open the deal">
              {o.deal.title}
            </AppLink>
          ) : (
            o.deal.title
          )}
        </span>
        {!closed && <EditOrderDialog order={o} />}
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/order/${o.id}`} target="_blank" />} title="Proforma invoice for advance payment">
          <Printer /> Proforma
        </Button>
        {o.dnNumber && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/order/${o.id}?doc=delivery`} target="_blank" />} title="Delivery note for the customer to sign">
            <Truck /> Delivery note
          </Button>
        )}
        {active && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/print/invoice/${active.id}`} target="_blank" />}>
            <Receipt /> Invoice
          </Button>
        )}
        {o.status === "open" && <MarkDeliveredDialog orderId={o.id} deliveryAddress={o.deliveryAddress} />}
        {o.status === "delivered" && canAccounts && (
          <IssueInvoiceDialog
            orderId={o.id}
            orderNumber={o.number}
            termsDays={o.termsDays}
            deliveredOn={o.deliveredOn ?? ""}
            address={o.deliveryAddress || o.company.address || (o.company.emirate ? `${o.company.emirate}, United Arab Emirates` : "")}
            total={o.total}
            customerTrn={o.company.trn}
            nextNumber={nextNumber}
            ourTrn={ourTrn}
          />
        )}
        {(o.status === "open" || o.status === "delivered") && <CancelOrderButton orderId={o.id} number={o.number} />}
      </div>

      {o.status === "cancelled" && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm">
          Cancelled{o.cancelledAt ? ` on ${longDay(o.cancelledAt.toISOString().slice(0, 10))}` : ""}: {o.cancelReason}
        </p>
      )}
      {o.status === "delivered" && !canAccounts && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Delivered. The tax invoice is made in Accounts; ask whoever handles invoices.</p>
      )}

      <StatStrip
        items={[
          { label: "Total with VAT", value: money(o.total), hint: `${money(o.subtotal)} + VAT ${o.vatPct}%` },
          { label: "Customer PO", value: o.customerRef || "-", hint: `${termsLabel(o.termsDays)}${o.customerRefDate ? ` · PO dated ${longDay(o.customerRefDate)}` : ""}` },
          {
            label: "Delivery",
            value: o.dnNumber ?? "Not yet",
            hint: o.deliveredOn ? `${longDay(o.deliveredOn)}${o.receivedBy ? ` · ${o.receivedBy}` : ""}` : "Mark delivered when the goods go out",
          },
          {
            label: "Invoice",
            value: active ? active.number : "Not yet",
            hint: active ? `${active.state.label}${active.state.balance > 0 ? ` · owed ${money(active.state.balance)}` : ""}` : o.status === "delivered" ? "Ready to invoice" : "After delivery",
          },
        ]}
      />

      <UrlTabs
        initial={tab}
        tabs={[
          {
            key: "lines",
            label: "Lines",
            icon: <ListOrdered />,
            content: (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="overflow-x-auto rounded-lg border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit price</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {o.items.map((i, n) => (
                        <TableRow key={i.id}>
                          <TableCell className="py-1.5 text-muted-foreground">{n + 1}</TableCell>
                          <TableCell className="py-1.5 whitespace-normal">{i.description}</TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums">{i.qty}</TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums">{money(i.unitPrice)}</TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums">{money(lineTotal(i))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={4} className="py-1.5 text-right text-muted-foreground">
                          Subtotal · VAT {o.vatPct}%
                        </TableCell>
                        <TableCell className="py-1.5 text-right tabular-nums">
                          {money(o.subtotal)} · {money(o.vatAmount)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={4} className="py-1.5 text-right font-semibold">
                          Total
                        </TableCell>
                        <TableCell className="py-1.5 text-right font-semibold tabular-nums">{money(o.total)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                <aside className="grid content-start gap-2 rounded-lg border bg-card p-3 text-sm">
                  <h2 className="text-sm font-medium">Inside the company only</h2>
                  <dl className="grid gap-1">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">From quote</dt>
                      <dd>
                        <Link href={`/accounts/quotes/${o.quote.id}`} className="font-mono hover:underline">
                          {o.quote.number}
                        </Link>
                      </dd>
                    </div>
                    {o.costTotal != null && (
                      <>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Quoted cost</dt>
                          <dd className="tabular-nums">{money(o.costTotal)}</dd>
                        </div>
                        <div className="flex justify-between font-medium">
                          <dt>Expected profit</dt>
                          <dd className="tabular-nums">{money(profit!)}</dd>
                        </div>
                      </>
                    )}
                    {costs && (
                      <div className="mt-1 grid gap-1 border-t pt-1.5">
                        <div className="flex items-center justify-between">
                          <dt className="text-muted-foreground">Supplier bills</dt>
                          <dd>
                            <Link href={`/accounts/bills/new?order=${o.id}`} className="text-xs font-medium hover:underline">
                              + Add bill
                            </Link>
                          </dd>
                        </div>
                        {costs.bills.map((b) => (
                          <div key={b.id} className="flex justify-between gap-2 text-xs">
                            <Link href={`/accounts/bills/${b.id}`} className="truncate hover:underline">
                              <span className="font-mono">{b.number}</span> · {b.payee}
                            </Link>
                            <span className="tabular-nums">{money(b.subtotal)}</span>
                          </div>
                        ))}
                        {costs.bills.length > 0 && (
                          <>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Real cost</dt>
                              <dd className="tabular-nums">{money(costs.cost)}</dd>
                            </div>
                            <div className="flex justify-between font-medium">
                              <dt>Real profit</dt>
                              <dd className={`tabular-nums ${o.subtotal - costs.cost < 0 ? "text-destructive" : ""}`}>{money(o.subtotal - costs.cost)}</dd>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <dt>Made by</dt>
                      <dd>{o.author?.name ?? "-"}</dd>
                    </div>
                  </dl>
                  {o.deliveryAddress && (
                    <div className="text-xs">
                      <div className="text-muted-foreground">Delivery address</div>
                      <div className="whitespace-pre-line">{o.deliveryAddress}</div>
                    </div>
                  )}
                  {o.notes && (
                    <div className="text-xs">
                      <div className="text-muted-foreground">Notes</div>
                      <div className="whitespace-pre-line">{o.notes}</div>
                    </div>
                  )}
                </aside>
              </div>
            ),
          },
          {
            key: "invoices",
            label: `Invoice${o.invoices.length > 1 ? "s" : ""}`,
            icon: <FileText />,
            content: (
              <div className="overflow-hidden rounded-lg border bg-card">
                {o.invoices.length ? (
                  <ul className="divide-y">
                    {o.invoices.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                        {canAccounts ? (
                          <AppLink href={`/accounts/invoices/${i.id}`} className="font-mono text-sm font-medium hover:underline">
                            {i.number}
                          </AppLink>
                        ) : (
                          <Link href={`/print/invoice/${i.id}`} target="_blank" className="font-mono text-sm font-medium hover:underline">
                            {i.number}
                          </Link>
                        )}
                        <InvoiceStateBadge state={i.state} />
                        <span className="text-xs text-muted-foreground">
                          {longDay(i.issueDate)} · due {longDay(i.dueDate)}
                        </span>
                        <span className="ml-auto text-sm tabular-nums">
                          {money(i.total)}
                          {i.state.paid > 0 && <span className="text-muted-foreground"> · paid {money(i.state.paid)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">No invoice yet. It is made after delivery{canAccounts ? " with Make invoice" : " in Accounts"}.</p>
                )}
              </div>
            ),
          },
          ...(canFiles
            ? [
                {
                  key: "files",
                  label: `Files${files.length ? ` (${files.length})` : ""}`,
                  icon: <Files />,
                  content: (
                    <div className="overflow-hidden rounded-lg border bg-card">
                      <div className="flex items-center gap-2 border-b px-3 py-1.5">
                        <span className="text-xs text-muted-foreground">Customer PO, signed delivery note, anything for this order</span>
                        <div className="ml-auto">
                          <UploadDialog folder={o.status === "open" ? "lpo" : "delivery"} related={{ type: "order", id: o.id }} relatedLabel={o.number} />
                        </div>
                      </div>
                      <FileTable rows={files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))} meId={user.id} isAdmin={user.role === "admin"} empty="No files yet. Upload the customer's PO with +." />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
