import Link from "next/link";
import { InvoiceStateBadge, OrderStatusBadge } from "@/components/order-bits";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { Empty } from "@/components/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/user-avatar";
import { requireApp } from "@/lib/auth/session";
import { viewerOf } from "@/lib/auth/visibility";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { termsLabel } from "@/lib/invoicing";
import { listOrders } from "@/lib/orders-data";
import { money } from "@/lib/quotation";

export const metadata = { title: "Orders · Zeronix Sales" };

const VIEWS = [
  { key: "open", label: "To deliver", match: (s: string) => s === "open" },
  { key: "delivered", label: "To invoice", match: (s: string) => s === "delivered" },
  { key: "invoiced", label: "Invoiced", match: (s: string) => s === "invoiced" },
  { key: "all", label: "All", match: () => true },
] as const;

/** Sales orders made from accepted quotes: what to deliver, what to invoice, and what customers still owe. */
export default async function OrdersPage({ searchParams }: PageProps<"/sales/orders">) {
  const access = await requireApp("sales");
  const v = (await searchParams).view;
  const view = VIEWS.find((x) => x.key === v) ?? VIEWS[3];
  const all = await listOrders(viewerOf(access));
  const rows = all.filter((o) => view.match(o.status));
  const today = dubaiToday();
  const count = (k: string) => all.filter((o) => VIEWS.find((x) => x.key === k)!.match(o.status)).length;

  return (
    <div className="grid gap-3">
      <PageToolbar title="Orders" meta={`${rows.length} shown · make an order from an accepted quote`}>
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
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">PO</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Invoice</TableHead>
              <TableHead className="hidden lg:table-cell">Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="py-1.5">
                  <Link href={`/sales/orders/${o.id}`} className="font-mono text-sm font-medium hover:underline">
                    {o.number}
                  </Link>
                  <div className="text-xs text-muted-foreground">{dayLabel(o.createdAt.toISOString().slice(0, 10), today)}</div>
                </TableCell>
                <TableCell className="max-w-64 py-1.5">
                  <div className="truncate font-medium">{o.companyName}</div>
                  <div className="truncate text-xs text-muted-foreground" title={o.dealTitle}>
                    {o.dealTitle}
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
                  {o.invoice ? (
                    <div className="grid justify-items-start gap-0.5">
                      <span className="font-mono text-xs">{o.invoice.number}</span>
                      <InvoiceStateBadge state={o.invoice.state} />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="hidden py-1.5 lg:table-cell">{o.ownerName ? <UserAvatar name={o.ownerName} size={24} /> : "-"}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Empty>{all.length ? "Nothing in this view." : "No orders yet. Open an accepted quote and press Convert to order."}</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
