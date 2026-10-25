import { eq, inArray } from "drizzle-orm";
import { AppLink } from "@/components/app-link";
import { IssueInvoiceDialog } from "@/components/order-ui";
import { PageToolbar } from "@/components/page-toolbar";
import { Empty } from "@/components/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, schema } from "@/db";
import { nextInvoiceNumber } from "@/lib/accounts-data";
import { requireFinance } from "@/lib/auth/session";
import { termsLabel } from "@/lib/invoicing";
import { listOrders } from "@/lib/orders-data";
import { getSetting } from "@/lib/settings";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "To invoice · Zeronix Accounts" };

/** Delivered orders waiting for their tax invoice, oldest delivery first. */
export default async function ToInvoicePage() {
  const { user, apps } = await requireFinance();
  const [orders, nextNumber, ourTrn] = await Promise.all([
    // Accounts (finance) works on every order, whoever the deal belongs to
    listOrders({ id: user.id, seesAll: true }),
    nextInvoiceNumber(),
    getSetting("quote_trn"),
  ]);
  const rows = orders.filter((o) => o.status === "delivered").sort((a, b) => (a.deliveredOn ?? "").localeCompare(b.deliveredOn ?? ""));
  const details = rows.length
    ? await db
        .select({ id: schema.salesOrders.id, deliveryAddress: schema.salesOrders.deliveryAddress, address: schema.companies.address, emirate: schema.companies.emirate, trn: schema.companies.trn })
        .from(schema.salesOrders)
        .innerJoin(schema.companies, eq(schema.companies.id, schema.salesOrders.companyId))
        .where(inArray(schema.salesOrders.id, rows.map((r) => r.id)))
    : [];
  return (
    <div className="grid gap-3">
      <PageToolbar title="To invoice" meta={`${rows.length} delivered order${rows.length === 1 ? "" : "s"} · next invoice ${nextNumber}`} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Delivered</TableHead>
              <TableHead className="hidden sm:table-cell">Terms</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Invoice</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => {
              const d = details.find((x) => x.id === o.id);
              return (
                <TableRow key={o.id}>
                  <TableCell className="py-1.5">
                    {apps.includes("sales") ? (
                      <AppLink href={`/sales/orders/${o.id}`} className="font-mono text-sm font-medium hover:underline">
                        {o.number}
                      </AppLink>
                    ) : (
                      <span className="font-mono text-sm font-medium">{o.number}</span>
                    )}
                    <div className="text-xs text-muted-foreground">{o.dnNumber}</div>
                  </TableCell>
                  <TableCell className="max-w-64 py-1.5">
                    <div className="truncate font-medium">{o.companyName}</div>
                    {o.customerRef && <div className="text-xs text-muted-foreground">PO {o.customerRef}</div>}
                  </TableCell>
                  <TableCell className="hidden py-1.5 text-xs md:table-cell">{o.deliveredOn ? longDay(o.deliveredOn) : "-"}</TableCell>
                  <TableCell className="hidden py-1.5 text-xs sm:table-cell">{termsLabel(o.termsDays)}</TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums">{money(o.total)}</TableCell>
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
                </TableRow>
              );
            })}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>Nothing to invoice. Orders show here once they are marked delivered.</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
