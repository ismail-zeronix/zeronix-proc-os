import { FilePlus2, History } from "lucide-react";
import Link from "next/link";
import { InvoiceStateBadge } from "@/components/order-bits";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { Empty } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireFinance } from "@/lib/auth/session";
import { categoryLabel } from "@/lib/purchases";
import { listBills, type BillRow } from "@/lib/purchases-data";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Bills · Zeronix Accounts" };

const VIEWS = [
  { key: "topay", label: "To pay", match: (b: BillRow) => b.state.balance > 0 },
  { key: "overdue", label: "Overdue", match: (b: BillRow) => b.state.key === "overdue" },
  { key: "paid", label: "Paid", match: (b: BillRow) => b.state.key === "paid" },
  { key: "void", label: "Void", match: (b: BillRow) => b.status === "void" },
  { key: "all", label: "All", match: () => true },
] as const;

/** Supplier bills (and unpaid bills from before the portal): what we owe, what is late, what is paid. */
export default async function BillsPage({ searchParams }: PageProps<"/accounts/bills">) {
  await requireFinance();
  const v = (await searchParams).view;
  const view = VIEWS.find((x) => x.key === v) ?? VIEWS[0];
  const all = await listBills({ kinds: ["bill", "opening"] });
  const rows = all.filter(view.match);
  if (view.key === "topay" || view.key === "overdue") rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const owed = all.filter(VIEWS[0].match).reduce((s, b) => s + b.state.balance, 0);

  return (
    <div className="grid gap-3">
      <PageToolbar title="Bills" meta={`${money(owed)} to pay`}>
        <Segmented
          items={VIEWS.map((x) => ({
            href: x.key === "topay" ? "/accounts/bills" : `/accounts/bills?view=${x.key}`,
            label: `${x.label}${x.key === "all" ? "" : ` ${all.filter(x.match).length}`}`,
            title: x.label,
            active: view.key === x.key,
          }))}
        />
        <Button variant="outline" size="sm" className="ml-auto" nativeButton={false} render={<Link href="/accounts/bills/new?kind=opening" />} title="Supplier bills still unpaid in Zoho when the portal started">
          <History /> Opening balance
        </Button>
        <Button size="sm" nativeButton={false} render={<Link href="/accounts/bills/new" />}>
          <FilePlus2 /> New bill
        </Button>
      </PageToolbar>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Bill</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="hidden md:table-cell">For</TableHead>
              <TableHead className="hidden sm:table-cell">Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">To pay</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id} className={b.status === "void" ? "opacity-60" : ""}>
                <TableCell className="py-1.5">
                  <Link href={`/accounts/bills/${b.id}`} className="font-mono text-sm font-medium hover:underline">
                    {b.number}
                  </Link>
                  <div className="text-xs text-muted-foreground">{longDay(b.billDate)}</div>
                </TableCell>
                <TableCell className="max-w-64 py-1.5">
                  {b.supplierId ? (
                    <Link href={`/accounts/suppliers/${b.supplierId}`} className="block truncate font-medium hover:underline">
                      {b.payee}
                    </Link>
                  ) : (
                    <span className="block truncate font-medium">{b.payee}</span>
                  )}
                  <div className="truncate text-xs text-muted-foreground">
                    {b.kind === "opening" ? "Opening balance" : b.supplierRef ? `Their no. ${b.supplierRef}` : ""}
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-56 py-1.5 text-xs md:table-cell">
                  {b.orderId ? (
                    <Link href={`/accounts/orders/${b.orderId}`} className="font-mono hover:underline">
                      {b.orderNumber}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{categoryLabel(b.category)}</span>
                  )}
                </TableCell>
                <TableCell className="hidden py-1.5 text-xs whitespace-nowrap sm:table-cell">{longDay(b.dueDate)}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums">{money(b.total)}</TableCell>
                <TableCell className="py-1.5 text-right font-medium tabular-nums">{b.state.balance > 0 ? money(b.state.balance) : "-"}</TableCell>
                <TableCell className="py-1.5">
                  <InvoiceStateBadge state={b.state} />
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Empty>{all.length ? "Nothing in this view." : "No bills yet. Press New bill when a supplier invoice arrives."}</Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
