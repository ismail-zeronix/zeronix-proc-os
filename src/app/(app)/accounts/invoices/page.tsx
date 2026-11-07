import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { ExportActions } from "@/components/list-actions";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { OpeningInvoiceDialog } from "@/components/opening-ui";
import { InvoiceStateBadge } from "@/components/order-bits";
import { ListSearch } from "@/components/list-search";
import { PageToolbar } from "@/components/page-toolbar";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { INVOICE_SORT_KEYS, invoicePage } from "@/lib/accounts-data";
import { requireFinance } from "@/lib/auth/session";
import { readList } from "@/lib/list-params";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Invoices · Zeronix Accounts" };

const VIEWS = [
  { key: "open", label: "Not paid" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
] as const;

const PATH = "/accounts/invoices";

/** Every tax invoice, filtered by where it stands today. */
export default async function InvoicesPage({ searchParams }: PageProps<"/accounts/invoices">) {
  await requireFinance();
  const sp = await searchParams;
  const view = VIEWS.find((x) => x.key === sp.view) ?? VIEWS[0];
  const list = readList(sp, INVOICE_SORT_KEYS, { sort: "date", dir: "desc" });
  const { rows, total, counts } = await invoicePage(view.key, list);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={PATH} sp={sp} list={list} align={align} />;
  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Invoices" meta={`${total} shown`}>
        <ListSearch placeholder="Search number, customer, PO" />
        <Segmented
          items={VIEWS.map((x) => ({
            href: x.key === "open" ? PATH : `${PATH}?view=${x.key}`,
            label: `${x.label} ${counts[x.key] ?? 0}`,
            title: x.label,
            active: view.key === x.key,
          }))}
        />
        <OpeningInvoiceDialog />
        <Button size="sm" nativeButton={false} render={<Link href="/accounts/invoices/new" />}>
          <ReceiptText /> New invoice
        </Button>
      </PageToolbar>
      <DataTable
        noun="invoice"
        total={total}
        acrossPages={false}
        actions={<ExportActions list="invoices" />}
        pager={<ListPager path={PATH} sp={sp} list={list} total={total} />}
        empty={counts.all ? "Nothing in this view." : "No invoices yet. Press New invoice, or make one from a delivered order (To invoice)."}
        columns={[
          { label: head("Invoice", "date") },
          { label: head("Customer", "customer") },
          { label: head("Due", "due"), className: "hidden md:table-cell" },
          { label: head("Total", "total", "right"), className: "text-right" },
          { label: head("Owed", "owed", "right"), className: "text-right" },
          { label: "Status" },
          { label: "Owner", className: "hidden lg:table-cell" },
        ]}
        rows={rows.map((i) => ({
          id: i.id,
          href: `/accounts/invoices/${i.id}`,
          cells: [
            <>
              <Link href={`/accounts/invoices/${i.id}`} className="font-mono text-sm font-medium hover:underline">
                {i.number}
              </Link>
              <div className="text-xs text-muted-foreground">{longDay(i.issueDate)}</div>
            </>,
            <Link key="c" href={`/accounts/customers/${i.companyId}`} title={i.customerName} className="block max-w-64 truncate font-medium hover:underline">
              {i.customerName}
            </Link>,
            <span key="d" className="text-xs whitespace-nowrap">
              {longDay(i.dueDate)}
            </span>,
            <span key="t" className="tabular-nums">
              {money(i.total)}
            </span>,
            <span key="o" className="font-medium tabular-nums">
              {i.state.balance > 0 ? money(i.state.balance) : "-"}
            </span>,
            <InvoiceStateBadge key="s" state={i.state} />,
            i.ownerName ? <UserAvatar key="u" name={i.ownerName} size={24} /> : "-",
          ],
        }))}
      />
    </div>
  );
}
