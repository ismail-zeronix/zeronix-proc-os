import Link from "next/link";
import { HBarPanel } from "@/components/charts/hbar-panel";
import { PageToolbar } from "@/components/page-toolbar";
import { ExpenseDialog } from "@/components/purchases-ui";
import { Segmented } from "@/components/segmented";
import { Empty } from "@/components/stat-tile";
import { StatStrip } from "@/components/stat-strip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { categoryLabel } from "@/lib/purchases";
import { listBills, orderOptions, supplierOptions } from "@/lib/purchases-data";
import { longDay, money, round2 } from "@/lib/quotation";

export const metadata = { title: "Expenses · Zeronix Accounts" };

const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
function shift(m: string, by: number) {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}
const lastDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Money spent on the spot, one month at a time, with where it went. */
export default async function ExpensesPage({ searchParams }: PageProps<"/accounts/expenses">) {
  await requireFinance();
  const sp = await searchParams;
  const thisMonth = dubaiToday().slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : thisMonth;
  const [rows, suppliers, orders] = await Promise.all([listBills({ kinds: ["expense"], from: `${month}-01`, to: lastDay(month) }), supplierOptions(), orderOptions()]);
  const live = rows.filter((r) => r.status !== "void");
  const spent = round2(live.reduce((s, r) => s + r.subtotal, 0));
  const vat = round2(live.reduce((s, r) => s + r.vatAmount, 0));
  const byCat = new Map<string, number>();
  for (const r of live) byCat.set(r.category, round2((byCat.get(r.category) ?? 0) + r.subtotal));
  const months = [-2, -1, 0].map((i) => shift(thisMonth, i));

  return (
    <div className="grid gap-3">
      <PageToolbar title="Expenses" meta={`${live.length} in ${monthName(month)}`}>
        <Segmented items={months.map((m) => ({ href: m === thisMonth ? "/accounts/expenses" : `/accounts/expenses?month=${m}`, label: monthName(m), title: monthName(m), active: m === month }))} />
        <div className="ml-auto">
          <ExpenseDialog suppliers={suppliers} orders={orders} />
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
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>Date</TableHead>
                <TableHead>Paid to</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden text-right md:table-cell">VAT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={r.status === "void" ? "line-through opacity-60" : ""}>
                  <TableCell className="py-1.5 text-xs whitespace-nowrap">
                    <Link href={`/accounts/bills/${r.id}`} className="font-mono font-medium hover:underline">
                      {r.number}
                    </Link>
                    <div className="text-muted-foreground">{longDay(r.billDate)}</div>
                  </TableCell>
                  <TableCell className="max-w-64 py-1.5">
                    <div className="truncate font-medium">{r.payee}</div>
                    {r.orderNumber && <div className="truncate font-mono text-xs text-muted-foreground">for {r.orderNumber}</div>}
                  </TableCell>
                  <TableCell className="hidden py-1.5 text-xs sm:table-cell">{categoryLabel(r.category)}</TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums">{money(r.subtotal)}</TableCell>
                  <TableCell className="hidden py-1.5 text-right text-xs tabular-nums md:table-cell">{r.vatAmount ? money(r.vatAmount) : "-"}</TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Empty>No expenses in {monthName(month)}. Press New expense for fuel, rent, a visa fee or anything paid on the spot.</Empty>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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
