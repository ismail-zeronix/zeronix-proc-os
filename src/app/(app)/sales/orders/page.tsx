import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { IssueInvoiceDialog } from "@/components/order-ui";
import { InvoiceStateBadge, OrderStatusBadge } from "@/components/order-bits";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { Empty } from "@/components/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { db, schema } from "@/db";
import { nextInvoiceNumber } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { termsLabel } from "@/lib/invoicing";
import { listOrders } from "@/lib/orders-data";
import { money } from "@/lib/quotation";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "Sales orders · Zeronix Sales" };

const VIEWS = [
  { key: "open", label: "To deliver", match: (s: string) => s === "open" },
  { key: "delivered", label: "To invoice", match: (s: string) => s === "delivered" },
  { key: "invoiced", label: "Invoiced", match: (s: string) => s === "invoiced" },
  { key: "all", label: "All", match: () => true },
] as const;

/**
 * Sales orders made from accepted quotes: what to deliver, what to invoice, and what customers still owe. On "To invoice"
 * the accounts team issues the tax invoice straight from the list (oldest delivery first).
 */
export default async function OrdersPage({ searchParams }: PageProps<"/sales/orders">) {
  const access = await requireApp("sales");
  const v = (await searchParams).view;
  const view = VIEWS.find((x) => x.key === v) ?? VIEWS[3];
  const all = await listOrders(financeViewerOf(access));
  const toInvoice = view.key === "delivered";
  const rows = all.filter((o) => view.match(o.status));
  if (toInvoice) rows.sort((a, b) => (a.deliveredOn ?? "").localeCompare(b.deliveredOn ?? ""));
  const today = dubaiToday();
  const count = (k: string) => all.filter((o) => VIEWS.find((x) => x.key === k)!.match(o.status)).length;
  const invoicing = toInvoice && access.finance && rows.length > 0;
  const [nextNumber, ourTrn, details] = invoicing
    ? await Promise.all([
        nextInvoiceNumber(),
        getSetting("quote_trn"),
        db
          .select({ id: schema.salesOrders.id, deliveryAddress: schema.salesOrders.deliveryAddress, address: schema.companies.address, emirate: schema.companies.emirate, trn: schema.companies.trn })
          .from(schema.salesOrders)
          .innerJoin(schema.companies, eq(schema.companies.id, schema.salesOrders.companyId))
          .where(inArray(schema.salesOrders.id, rows.map((r) => r.id))),
      ])
    : ["", "", []];

  return (
    <div className="grid gap-3">
      <PageToolbar title="Sales orders" meta={`${rows.length} shown${invoicing ? ` · next invoice ${nextNumber}` : " · make a sales order from an accepted quote"}`}>
        <Segmented
          items={VIEWS.map((x) => ({
            href: x.key === "all" ? "/sales/orders" : `/sales/orders?view=${x.key}`,
            label: `${x.label}${x.key === "all" ? "" : ` ${count(x.key)}`}`,
            title: x.label,
            active: view.key === x.key,
          }))}
        />
      </PageToolbar>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Sales order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">PO</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">{toInvoice ? "Delivered" : "Invoice"}</TableHead>
              <TableHead className="hidden lg:table-cell">Owner</TableHead>
              {invoicing && (
                <TableHead className="text-right">
                  <span className="sr-only">Invoice</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => {
              const d = details.find((x) => x.id === o.id);
              return (
                <TableRow key={o.id}>
                  <TableCell className="py-1.5">
                    <Link href={`/sales/orders/${o.id}`} className="font-mono text-sm font-medium hover:underline">
                      {o.number}
                    </Link>
                    <div className="text-xs text-muted-foreground">{toInvoice && o.dnNumber ? o.dnNumber : dayLabel(o.createdAt.toISOString().slice(0, 10), today)}</div>
                  </TableCell>
                  <TableCell className="max-w-64 py-1.5">
                    <Link href={`/sales/customers/${o.companyId}`} className="block truncate font-medium hover:underline">
                      {o.companyName}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground" title={o.dealTitle || undefined}>
                      {o.dealTitle || "Instant quote"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden py-1.5 text-xs md:table-cell">
                    {o.customerRef || "-"}
                    <div className="text-muted-foreground">{termsLabel(o.termsDays)}</div>
                  </TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums">{money(o.total)}</TableCell>
                  <TableCell className="py-1.5">
                    <OrderStatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="hidden py-1.5 sm:table-cell">
                    {toInvoice ? (
                      <span className="text-xs">{o.deliveredOn ? dayLabel(o.deliveredOn, today) : "-"}</span>
                    ) : o.invoice ? (
                      <div className="grid justify-items-start gap-0.5">
                        {access.finance ? (
                          <Link href={`/accounts/invoices/${o.invoice.id}`} className="font-mono text-xs hover:underline">
                            {o.invoice.number}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs">{o.invoice.number}</span>
                        )}
                        <InvoiceStateBadge state={o.invoice.state} />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden py-1.5 lg:table-cell">{o.ownerName ? <UserAvatar name={o.ownerName} size={24} /> : "-"}</TableCell>
                  {invoicing && (
                    <TableCell className="py-1.5 text-right">
                      <IssueInvoiceDialog
                        orderId={o.id}
                        orderNumber={o.number}
                        termsDays={o.termsDays}
                        deliveredOn={o.deliveredOn ?? ""}
                        address={d?.deliveryAddress || d?.address || (d?.emirate ? `${d.emirate}, United Arab Emirates` : "")}
                        total={o.total}
                        customerTrn={d?.trn ?? ""}
                        nextNumber={nextNumber}
                        ourTrn={ourTrn}
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Empty>
                    {!all.length
                      ? "No sales orders yet. Open an accepted quote and press Convert to sales order."
                      : toInvoice
                        ? "Nothing to invoice. Sales orders show here once they are marked delivered."
                        : "Nothing in this view."}
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
