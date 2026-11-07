import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { ExportActions } from "@/components/list-actions";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { IssueInvoiceDialog } from "@/components/order-ui";
import { PageToolbar } from "@/components/page-toolbar";
import { db, schema } from "@/db";
import { nextInvoiceNumber } from "@/lib/accounts-data";
import { requireFinance } from "@/lib/auth/session";
import { termsLabel } from "@/lib/invoicing";
import { pageOf, readList, sortRows } from "@/lib/list-params";
import { listOrders } from "@/lib/orders-data";
import { getSetting } from "@/lib/settings";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "To invoice · Zeronix Accounts" };

const PATH = "/accounts/to-invoice";

/** Delivered orders waiting for their tax invoice, oldest delivery first. */
export default async function ToInvoicePage({ searchParams }: PageProps<"/accounts/to-invoice">) {
  const { user } = await requireFinance();
  const sp = await searchParams;
  const list = readList(sp, ["delivered", "customer", "total"], { sort: "delivered", dir: "asc" });
  const [orders, nextNumber, ourTrn] = await Promise.all([
    // Accounts (finance) works on every order, whoever the deal belongs to
    listOrders({ id: user.id, seesAll: true }),
    nextInvoiceNumber(),
    getSetting("quote_trn"),
  ]);
  const delivered = sortRows(orders.filter((o) => o.status === "delivered"), { delivered: (o) => o.deliveredOn, customer: (o) => o.companyName, total: (o) => o.total }, list);
  const rows = pageOf(delivered, list);
  const details = rows.length
    ? await db
        .select({ id: schema.salesOrders.id, deliveryAddress: schema.salesOrders.deliveryAddress, address: schema.companies.address, emirate: schema.companies.emirate, trn: schema.companies.trn })
        .from(schema.salesOrders)
        .innerJoin(schema.companies, eq(schema.companies.id, schema.salesOrders.companyId))
        .where(inArray(schema.salesOrders.id, rows.map((r) => r.id)))
    : [];
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={PATH} sp={sp} list={list} align={align} />;
  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="To invoice" meta={`${delivered.length} delivered order${delivered.length === 1 ? "" : "s"} · next invoice ${nextNumber}`} />
      <DataTable
        noun="sales order"
        total={delivered.length}
        acrossPages={false}
        actions={<ExportActions list="orders" />}
        pager={<ListPager path={PATH} sp={sp} list={list} total={delivered.length} />}
        empty="Nothing to invoice. Sales orders show here once they are marked delivered."
        columns={[
          { label: "Sales order" },
          { label: head("Customer", "customer") },
          { label: head("Delivered", "delivered"), className: "hidden md:table-cell" },
          { label: "Terms", className: "hidden sm:table-cell" },
          { label: head("Total", "total", "right"), className: "text-right" },
          { label: <span className="sr-only">Invoice</span>, className: "text-right" },
        ]}
        rows={rows.map((o) => {
          const d = details.find((x) => x.id === o.id);
          return {
            id: o.id,
            href: `/accounts/orders/${o.id}`,
            cells: [
              <>
                <Link href={`/accounts/orders/${o.id}`} className="font-mono text-sm font-medium hover:underline">
                  {o.number}
                </Link>
                <div className="text-xs text-muted-foreground">{o.dnNumber}</div>
              </>,
              <div key="c" className="max-w-64">
                <Link href={`/accounts/customers/${o.companyId}`} className="block truncate font-medium hover:underline">
                  {o.companyName}
                </Link>
                {o.customerRef && <div className="text-xs text-muted-foreground">PO {o.customerRef}</div>}
              </div>,
              <span key="d" className="text-xs">
                {o.deliveredOn ? longDay(o.deliveredOn) : "-"}
              </span>,
              <span key="t" className="text-xs">
                {termsLabel(o.termsDays)}
              </span>,
              <span key="a" className="tabular-nums">
                {money(o.total)}
              </span>,
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
            ],
          };
        })}
      />
    </div>
  );
}
