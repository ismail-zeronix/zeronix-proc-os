import { Download } from "lucide-react";
import Link from "next/link";
import { Segmented } from "@/components/segmented";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { money } from "@/lib/quotation";
import { AS_OF_TODAY, isReport, PERIODS, periodRange, REPORTS, type Cell, type Column, type ReportTable } from "@/lib/reports";
import { runReport } from "@/lib/reports-data";

export const metadata = { title: "Reports · Zeronix Accounts" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const amount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function show(v: Cell, c: Column | undefined) {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    if (c?.kind === "money") return amount(v);
    if (c?.kind === "pct") return `${v}%`;
    return v.toLocaleString("en-US");
  }
  return v;
}

function Table({ t }: { t: ReportTable }) {
  const right = (c: Column) => c.kind === "money" || c.kind === "pct" || c.kind === "int";
  return (
    <section className="overflow-x-auto rounded-xl border bg-card">
      <h2 className="border-b px-3 py-2 text-sm font-medium">{t.title}</h2>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            {t.columns.map((c, i) => (
              <th key={i} className={`px-3 py-1.5 font-medium whitespace-nowrap ${right(c) ? "text-right" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i} className={`border-b last:border-0 ${t.strong?.includes(i) ? "bg-muted/40 font-medium" : ""}`}>
              {r.map((v, j) => (
                <td key={j} className={`px-3 py-1.5 ${right(t.columns[j] ?? {}) ? "text-right tabular-nums whitespace-nowrap" : ""} ${typeof v === "number" && v < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                  {show(v, t.columns[j])}
                </td>
              ))}
            </tr>
          ))}
          {!t.rows.length && (
            <tr>
              <td colSpan={t.columns.length} className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing in this period.
              </td>
            </tr>
          )}
        </tbody>
        {t.total && (
          <tfoot>
            <tr className="border-t-2 font-semibold">
              {t.total.map((v, j) => (
                <td key={j} className={`px-3 py-1.5 ${right(t.columns[j] ?? {}) ? "text-right tabular-nums whitespace-nowrap" : ""}`}>
                  {show(v, t.columns[j])}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {t.note && <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t.note}</p>}
    </section>
  );
}

/** Profit and loss, VAT, what is owed both ways, sales, profit per order and cash: for a period, with a CSV download for the accountant. */
export default async function ReportsPage({ searchParams }: PageProps<"/accounts/reports">) {
  await requireFinance();
  const sp = await searchParams;
  const asked = one(sp.r) ?? "pnl";
  const key = isReport(asked) ? asked : "pnl";
  const p = periodRange(one(sp.period) ?? "this-month", dubaiToday(), one(sp.from), one(sp.to));
  const report = await runReport(key, p.from, p.to, p.label);
  const qs = (over: Record<string, string>) => {
    const q = new URLSearchParams({ r: key, ...(p.key === "custom" ? { from: p.from, to: p.to } : { period: p.key }), ...over });
    return q.toString();
  };
  const dated = !AS_OF_TODAY.includes(key);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-sm font-semibold">Reports</h1>
        <nav aria-label="Report" className="flex min-w-0 flex-wrap gap-1">
          {REPORTS.map((r) => (
            <Link
              key={r.key}
              href={`/accounts/reports?${qs({ r: r.key })}`}
              title={r.hint}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${r.key === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {dated ? (
          <>
            <Segmented items={PERIODS.map((x) => ({ href: `/accounts/reports?r=${key}&period=${x.key}`, label: x.label, title: x.label, active: p.key === x.key }))} />
            <form className="flex items-center gap-1.5" action="/accounts/reports">
              <input type="hidden" name="r" value={key} />
              <Input name="from" type="date" defaultValue={p.from} className="h-8 w-36" aria-label="From" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input name="to" type="date" defaultValue={p.to} className="h-8 w-36" aria-label="To" />
              <Button type="submit" variant="outline" size="sm">
                Show
              </Button>
            </form>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">As of today</span>
        )}
        <Button variant="outline" size="sm" className="ml-auto" nativeButton={false} render={<a href={`/api/reports?${qs({})}`} />} title="Download as a CSV file that opens in Excel">
          <Download /> Excel (CSV)
        </Button>
      </div>

      <StatStrip
        items={report.kpis.map((k) => ({
          label: k.label,
          value: k.kind === "money" ? money(k.value) : k.kind === "pct" ? `${k.value}%` : k.value.toLocaleString("en-US"),
          hint: k.hint,
        }))}
      />
      <p className="px-1 text-xs text-muted-foreground">{report.period}</p>
      <div className="grid gap-3 xl:grid-cols-2">
        {report.tables.map((t, i) => (
          <div key={i} className={report.tables.length === 1 || t.columns.length > 4 ? "xl:col-span-2" : ""}>
            <Table t={t} />
          </div>
        ))}
      </div>
    </div>
  );
}
