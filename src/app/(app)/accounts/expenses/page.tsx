import Link from "next/link";
import { HBarPanel } from "@/components/charts/hbar-panel";
import { DataTable } from "@/components/data-table";
import { ExportActions } from "@/components/list-actions";
import { ListPager, SortHead } from "@/components/list-controls";
import { LIST_PAGE } from "@/components/list-page";
import { ListSearch } from "@/components/list-search";
import { PageToolbar } from "@/components/page-toolbar";
import { ExpenseDialog } from "@/components/purchases-ui";
import { Segmented } from "@/components/segmented";
import { StatStrip } from "@/components/stat-strip";
import { requireFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { bankAccountOptions } from "@/lib/ledger/data";
import { currentOrgId } from "@/lib/org";
import { matching, pageOf, readList, sortRows } from "@/lib/list-params";
import { categoryLabel } from "@/lib/purchases";
import { directInvoiceOptions, listBills, orderOptions, supplierOptions } from "@/lib/purchases-data";
import { longDay, money, round2 } from "@/lib/quotation";

export const metadata = { title: "Expenses · Zeronix Accounts" };

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
function shift(m: string, by: number) {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}
const lastDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

const PATH = "/accounts/expenses";

/** Money spent on the spot, one month at a time, with where it went. */
export default async function ExpensesPage({ searchParams }: PageProps<"/accounts/expenses">) {
  await requireFinance();
  const sp = await searchParams;
  const thisMonth = dubaiToday().slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth;
  const [rows, suppliers, orders, invoices, accounts] = await Promise.all([listBills({ kinds: ["expense"], from: `${month}-01`, to: lastDay(month) }), supplierOptions(), orderOptions(), directInvoiceOptions(), currentOrgId().then(bankAccountOptions)]);
  const list = readList(sp, ["date", "payee", "category", "amount"], { sort: "date", dir: "desc" });
  const shown = pageOf(sortRows(matching(rows, list.q, (r) => [r.number, r.payee, categoryLabel(r.category), r.supplierRef]), { date: (r) => r.billDate, payee: (r) => r.payee, category: (r) => categoryLabel(r.category), amount: (r) => r.subtotal }, list), list);
  const head = (label: string, col: string, align?: "right") => <SortHead label={label} col={col} path={PATH} sp={sp} list={list} align={align} />;
  const live = rows.filter((r) => r.status !== "void");
  const spent = round2(live.reduce((s, r) => s + r.subtotal, 0));
  const vat = round2(live.reduce((s, r) => s + r.vatAmount, 0));
  const byCat = new Map<string, number>();
  for (const r of live) byCat.set(r.category, round2((byCat.get(r.category) ?? 0) + r.subtotal));
  const months = [-2, -1, 0].map((i) => shift(thisMonth, i));

  return (
    <div className={LIST_PAGE}>
      <PageToolbar title="Expenses" meta={`${live.length} in ${monthName(month)}`}>
        <Segmented items={months.map((m) => ({ href: m === thisMonth ? "/accounts/expenses" : `/accounts/expenses?month=${m}`, label: monthName(m), title: monthName(m), active: m === month }))} />
        <ListSearch placeholder="Search expense, paid to, category" />
        <div className="ml-auto">
          <ExpenseDialog suppliers={suppliers} orders={orders} invoices={invoices} accounts={accounts} defaultOpen={sp.new === "1"} />
        </div>
      </PageToolbar>
      <StatStrip
        items={[
          { label: "Spent before VAT", value: money(spent) },
          { label: "VAT paid (to reclaim)", value: money(vat) },
          { label: "Paid in total", value: money(round2(spent + vat)) },
          { label: "Biggest category", value: byCat.size ? categoryLabel([...byCat.entries()].sort((a, b) => b[1] - a[1])[0][0]) : "-" },
        ]}
      />
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <DataTable
          noun="expense"
          total={rows.length}
          acrossPages={false}
          actions={<ExportActions list="bills" />}
          pager={<ListPager path={PATH} sp={sp} list={list} total={rows.length} />}
          empty={`No expenses in ${monthName(month)}. Press New expense for fuel, rent, a visa fee or anything paid on the spot.`}
          columns={[
            { label: head("Date", "date") },
            { label: head("Paid to", "payee") },
            { label: head("Category", "category"), className: "hidden sm:table-cell" },
            { label: head("Amount", "amount", "right"), className: "text-right" },
            { label: "VAT", className: "hidden text-right md:table-cell" },
          ]}
          rows={shown.map((r) => ({
            id: r.id,
            href: `/accounts/bills/${r.id}`,
            cells: [
              <span key="d" className="text-xs whitespace-nowrap">
                <Link href={`/accounts/bills/${r.id}`} className={`font-mono font-medium hover:underline ${r.status === "void" ? "line-through" : ""}`}>
                  {r.number}
                </Link>
                <div className="text-muted-foreground">{longDay(r.billDate)}</div>
              </span>,
              <div key="p" className="max-w-64">
                <div className="truncate font-medium">{r.payee}</div>
                {r.orderNumber && <div className="truncate font-mono text-xs text-muted-foreground">for {r.orderNumber}</div>}
              </div>,
              <span key="c" className="text-xs">
                {categoryLabel(r.category)}
              </span>,
              <span key="a" className={`tabular-nums ${r.status === "void" ? "text-muted-foreground line-through" : ""}`}>
                {money(r.subtotal)}
              </span>,
              <span key="v" className="text-xs tabular-nums">
                {r.vatAmount ? money(r.vatAmount) : "-"}
              </span>,
            ],
          }))}
        />
        <HBarPanel
          title="Where it went"
          hint={`${monthName(month)}, before VAT`}
          color="var(--series-5)"
          views={[{ key: "amount", label: "Amount", format: "aed", unit: "AED", empty: "Nothing spent.", data: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: categoryLabel(k), value: v })) }]}
        />
      </div>
    </div>
  );
}
