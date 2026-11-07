import { FilePlus2, History } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { ExportActions } from "@/components/list-actions";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { InvoiceStateBadge } from "@/components/order-bits";
import { ListSearch } from "@/components/list-search";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { requireFinance } from "@/lib/auth/session";
import { readList } from "@/lib/list-params";
import { categoryLabel } from "@/lib/purchases";
import { BILL_SORT_KEYS, billPage } from "@/lib/purchases-data";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Bills · Zeronix Accounts" };

const VIEWS = [
  { key: "topay", label: "To pay" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
  { key: "all", label: "All" },
] as const;

const PATH = "/accounts/bills";

/** Supplier bills (and unpaid bills from before the portal): what we owe, what is late, what is paid. */
export default async function BillsPage({ searchParams }: PageProps<"/accounts/bills">) {
  await requireFinance();
  const sp = await searchParams;
  const view = VIEWS.find((x) => x.key === sp.view) ?? VIEWS[0];
  // what is to pay reads best by what falls due first
  const list = readList(sp, BILL_SORT_KEYS, view.key === "topay" || view.key === "overdue" ? { sort: "due", dir: "asc" } : { sort: "date", dir: "desc" });
  const { rows, total, counts, owed } = await billPage(view.key, list);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={PATH} sp={sp} list={list} align={align} />;

  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Bills" meta={`${money(owed)} to pay`}>
        <ListSearch placeholder="Search number, supplier, their no." />
        <Segmented
          items={VIEWS.map((x) => ({
            href: x.key === "topay" ? PATH : `${PATH}?view=${x.key}`,
            label: `${x.label} ${counts[x.key] ?? 0}`,
            title: x.label,
            active: view.key === x.key,
          }))}
        />
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/accounts/bills/new?kind=opening" />} title="Supplier bills still unpaid in Zoho when the portal started">
          <History /> Opening balance
        </Button>
        <Button size="sm" nativeButton={false} render={<Link href="/accounts/bills/new" />}>
          <FilePlus2 /> New bill
        </Button>
      </PageToolbar>
      <DataTable
        noun="bill"
        total={total}
        acrossPages={false}
        actions={<ExportActions list="bills" />}
        pager={<ListPager path={PATH} sp={sp} list={list} total={total} />}
        empty={counts.all ? "Nothing in this view." : "No bills yet. Press New bill when a supplier invoice arrives."}
        columns={[
          { label: head("Bill", "date") },
          { label: head("Supplier", "supplier") },
          { label: "For", className: "hidden md:table-cell" },
          { label: head("Due", "due"), className: "hidden sm:table-cell" },
          { label: head("Total", "total", "right"), className: "text-right" },
          { label: head("To pay", "owed", "right"), className: "text-right" },
          { label: "Status" },
        ]}
        rows={rows.map((b) => ({
          id: b.id,
          href: `/accounts/bills/${b.id}`,
          cells: [
            <>
              <Link href={`/accounts/bills/${b.id}`} className={`font-mono text-sm font-medium hover:underline ${b.status === "void" ? "line-through" : ""}`}>
                {b.number}
              </Link>
              <div className="text-xs text-muted-foreground">{longDay(b.billDate)}</div>
            </>,
            <div key="s" className="max-w-64">
              {b.supplierId ? (
                <Link href={`/accounts/suppliers/${b.supplierId}`} title={b.payee} className="block truncate font-medium hover:underline">
                  {b.payee}
                </Link>
              ) : (
                <span className="block truncate font-medium" title={b.payee}>{b.payee}</span>
              )}
              <div className="truncate text-xs text-muted-foreground">{b.kind === "opening" ? "Opening balance" : b.supplierRef ? `Their no. ${b.supplierRef}` : ""}</div>
            </div>,
            <span key="f" className="text-xs">
              {b.orderId ? (
                <Link href={`/accounts/orders/${b.orderId}`} className="font-mono hover:underline">
                  {b.orderNumber}
                </Link>
              ) : (
                <span className="text-muted-foreground">{categoryLabel(b.category)}</span>
              )}
            </span>,
            <span key="d" className="text-xs whitespace-nowrap">
              {longDay(b.dueDate)}
            </span>,
            <span key="t" className="tabular-nums">
              {money(b.total)}
            </span>,
            <span key="o" className="font-medium tabular-nums">
              {b.state.balance > 0 ? money(b.state.balance) : "-"}
            </span>,
            <InvoiceStateBadge key="b" state={b.state} />,
          ],
        }))}
      />
    </div>
  );
}
