import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { ExportActions } from "@/components/list-actions";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { IssueInvoiceDialog } from "@/components/order-ui";
import { InvoiceStateBadge, OrderStatusBadge } from "@/components/order-bits";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { UserAvatar } from "@/components/user-avatar";
import { db, schema } from "@/db";
import { nextInvoiceNumber } from "@/lib/accounts-data";
import type { Access } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { termsLabel } from "@/lib/invoicing";
import { pageOf, readList, sortRows } from "@/lib/list-params";
import { listOrders } from "@/lib/orders-data";
import { money } from "@/lib/quotation";
import { param, type SalesBase } from "@/lib/sales-base";
import { getSetting } from "@/lib/settings";

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
export async function OrdersView({ access, base, searchParams }: { access: Access; base: SalesBase; searchParams: Record<string, string | string[] | undefined> }) {
  const v = param(searchParams.view);
  const view = VIEWS.find((x) => x.key === v) ?? VIEWS[3];
  const all = await listOrders(financeViewerOf(access));
  const toInvoice = view.key === "delivered";
  const path = `${base}/orders`;
  const list = readList(searchParams, ["date", "customer", "total", "delivered"], toInvoice ? { sort: "delivered", dir: "asc" } : { sort: "date", dir: "desc" });
  const rows = all.filter((o) => view.match(o.status));
  const shown = pageOf(sortRows(rows, { date: (o) => o.createdAt.toISOString(), customer: (o) => o.companyName, total: (o) => o.total, delivered: (o) => o.deliveredOn }, list), list);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={path} sp={searchParams} list={list} align={align} />;
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
          .where(inArray(schema.salesOrders.id, shown.length ? shown.map((r) => r.id) : [0])),
      ])
    : ["", "", []];

  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Sales orders" meta={`${rows.length} shown${invoicing ? ` · next invoice ${nextNumber}` : " · make a sales order from an accepted quote"}`}>
        <Segmented
          items={VIEWS.map((x) => ({
            href: x.key === "all" ? `${base}/orders` : `${base}/orders?view=${x.key}`,
            label: `${x.label}${x.key === "all" ? "" : ` ${count(x.key)}`}`,
            title: x.label,
            active: view.key === x.key,
          }))}
        />
      </PageToolbar>
      <DataTable
        noun="sales order"
        total={rows.length}
        acrossPages={false}
        selectable={access.finance}
        actions={<ExportActions list="orders" />}
        pager={<ListPager path={path} sp={searchParams} list={list} total={rows.length} />}
        empty={!all.length ? "No sales orders yet. Open an accepted quote and press Convert to sales order." : toInvoice ? "Nothing to invoice. Sales orders show here once they are marked delivered." : "Nothing in this view."}
        columns={[
          { label: head("Sales order", "date") },
          { label: head("Customer", "customer") },
          { label: "PO", className: "hidden md:table-cell" },
          { label: head("Total", "total", "right"), className: "text-right" },
          { label: "Status" },
          { label: toInvoice ? head("Delivered", "delivered") : "Invoice", className: "hidden sm:table-cell" },
          { label: "Owner", className: "hidden lg:table-cell" },
          ...(invoicing ? [{ label: <span className="sr-only">Invoice</span>, className: "text-right" }] : []),
        ]}
        rows={shown.map((o) => {
          const d = details.find((x) => x.id === o.id);
          return {
            id: o.id,
            cells: [
              <>
                <Link href={`${base}/orders/${o.id}`} className="font-mono text-sm font-medium hover:underline">
                  {o.number}
                </Link>
                <div className="text-xs text-muted-foreground">{toInvoice && o.dnNumber ? o.dnNumber : dayLabel(o.createdAt.toISOString().slice(0, 10), today)}</div>
              </>,
              <div key="c" className="max-w-64">
                <Link href={`${base}/customers/${o.companyId}`} className="block truncate font-medium hover:underline">
                  {o.companyName}
                </Link>
                <div className="truncate text-xs text-muted-foreground" title={o.dealTitle || undefined}>
                  {o.dealTitle || "Instant quote"}
                </div>
              </div>,
              <span key="p" className="text-xs">
                {o.customerRef || "-"}
                <div className="text-muted-foreground">{termsLabel(o.termsDays)}</div>
              </span>,
              <span key="t" className="tabular-nums">
                {money(o.total)}
              </span>,
              <OrderStatusBadge key="s" status={o.status} />,
              toInvoice ? (
                <span key="v" className="text-xs">
                  {o.deliveredOn ? dayLabel(o.deliveredOn, today) : "-"}
                </span>
              ) : o.invoice ? (
                <div key="v" className="grid justify-items-start gap-0.5">
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
                <span key="v" className="text-xs text-muted-foreground">
                  -
                </span>
              ),
              o.ownerName ? <UserAvatar key="u" name={o.ownerName} size={24} /> : "-",
              ...(invoicing
                ? [
                    <IssueInvoiceDialog
                      key="i"
                      orderId={o.id}
                      orderNumber={o.number}
                      termsDays={o.termsDays}
                      deliveredOn={o.deliveredOn ?? ""}
                      address={d?.deliveryAddress || d?.address || (d?.emirate ? `${d.emirate}, United Arab Emirates` : "")}
                      total={o.total}
                      customerTrn={d?.trn ?? ""}
                      nextNumber={nextNumber}
                      ourTrn={ourTrn}
                    />,
                  ]
                : []),
            ],
          };
        })}
      />
    </div>
  );
}
