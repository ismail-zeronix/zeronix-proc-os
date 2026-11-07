import Link from "next/link";
import { DataTable } from "@/components/data-table";
import { ExportActions } from "@/components/list-actions";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { NewSupplierDialog } from "@/components/party-pickers";
import { ListSearch } from "@/components/list-search";
import { PageToolbar } from "@/components/page-toolbar";
import { SupplierTypeBadge } from "@/components/supplier-type-badge";
import { requireFinance } from "@/lib/auth/session";
import { termsLabel } from "@/lib/invoicing";
import { matching, pageOf, readList, sortRows } from "@/lib/list-params";
import { supplierBalances } from "@/lib/purchases-data";
import { longDay, money } from "@/lib/quotation";

export const metadata = { title: "Suppliers · Zeronix Accounts" };

const PATH = "/accounts/suppliers";

/** The same suppliers as in Procurement, from the money side: what we owe each one, and how late. */
export default async function AccountsSuppliersPage({ searchParams }: PageProps<"/accounts/suppliers">) {
  await requireFinance();
  const sp = await searchParams;
  const list = readList(sp, ["name", "bills", "owed", "overdue", "paid"], { sort: "overdue", dir: "desc" });
  const everyone = await supplierBalances();
  const all = matching(everyone, list.q, (s) => [s.name]);
  const sorted = list.sort === "overdue" && list.dir === "desc" ? all : sortRows(all, { name: (s) => s.name, bills: (s) => s.bills, owed: (s) => s.owed, overdue: (s) => s.overdue, paid: (s) => s.lastPaid }, list);
  const rows = pageOf(sorted, list);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={PATH} sp={sp} list={list} align={align} />;
  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Suppliers" meta={`${everyone.length} suppliers · we owe ${money(everyone.reduce((s, r) => s + r.owed, 0))}`}>
        <ListSearch placeholder="Search supplier" />
        <NewSupplierDialog defaultOpen={sp.new === "1"} goTo="/accounts/suppliers" />
      </PageToolbar>
      <DataTable
        noun="supplier"
        total={all.length}
        acrossPages={false}
        actions={<ExportActions list="suppliers" />}
        pager={<ListPager path={PATH} sp={sp} list={list} total={all.length} />}
        empty="No suppliers yet. Press New supplier, or add one from a new bill."
        columns={[
          { label: head("Supplier", "name") },
          { label: "Terms", className: "hidden md:table-cell" },
          { label: head("Bills", "bills", "right"), className: "hidden text-right sm:table-cell" },
          { label: head("We owe", "owed", "right"), className: "text-right" },
          { label: head("Overdue", "overdue", "right"), className: "text-right" },
          { label: head("Last paid", "paid"), className: "hidden lg:table-cell" },
        ]}
        rows={rows.map((s) => ({
          id: s.id,
          href: `/accounts/suppliers/${s.id}`,
          cells: [
            <div key="n" className="max-w-72">
              <Link href={`/accounts/suppliers/${s.id}`} title={s.name} className="block truncate font-medium hover:underline">
                {s.name}
              </Link>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <SupplierTypeBadge type={s.type} />
                {s.trn ? `TRN ${s.trn}` : "no TRN"}
              </div>
            </div>,
            <span key="t" className="text-xs">
              {termsLabel(s.termsDays)}
            </span>,
            <span key="b" className="tabular-nums">
              {s.bills || "-"}
            </span>,
            <div key="o" className="font-medium tabular-nums">
              {s.owed ? money(s.owed) : "-"}
              {s.advance > 0 && <div className="text-xs font-normal text-muted-foreground">{money(s.advance)} in advance</div>}
            </div>,
            <span key="v" className={`tabular-nums ${s.overdue ? "font-medium text-red-700 dark:text-red-400" : ""}`}>
              {s.overdue ? money(s.overdue) : "-"}
            </span>,
            <span key="p" className="text-xs">
              {s.lastPaid ? longDay(s.lastPaid) : "-"}
            </span>,
          ],
        }))}
      />
    </div>
  );
}
