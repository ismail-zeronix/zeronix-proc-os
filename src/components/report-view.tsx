import Link from "next/link";
import { PhoneCards } from "@/components/phone-cards";
import { StatStrip } from "@/components/stat-strip";
import { safeColor, type QuoteBrand } from "@/components/doc-parts";
import { longDay } from "@/lib/quotation";
import type { Cell, Column, Report, ReportTable } from "@/lib/reports";

const amount = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isNumeric = (c?: Column) => c?.kind === "money" || c?.kind === "pct" || c?.kind === "int";

/** A value as a person reads it. Negative money is in brackets, as accountants write it. */
export function showCell(v: Cell, c: Column | undefined): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    if (c?.kind === "money") return v < 0 ? `(${amount(-v)})` : amount(v);
    if (c?.kind === "pct") return `${v}%`;
    return v.toLocaleString("en-US");
  }
  if (c?.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return longDay(v);
  return v;
}

const showKpi = (k: Report["kpis"][number]) => (k.kind === "money" ? showCell(k.value, { label: "", kind: "money" }) : k.kind === "pct" ? `${k.value}%` : k.value.toLocaleString("en-US"));

/** How far past this size a table scrolls inside its panel, keeping its header and totals in view. */
const SCROLL_FROM = 25;

/** One table of a report on screen: indented trees, bold subtotals, and rows that open what is behind them. */
function ScreenTable({ t, showTitle }: { t: ReportTable; showTitle: boolean }) {
  const scrolls = t.rows.length > SCROLL_FROM;
  const table = (
    <table className="w-full text-sm">
      <thead className={`text-xs text-muted-foreground ${scrolls ? "sticky top-0 z-[1] bg-card" : ""}`}>
        <tr className="border-b">
          {t.columns.map((c, i) => (
            <th key={i} className={`px-3 py-1.5 font-medium whitespace-nowrap ${isNumeric(c) ? "text-right" : "text-left"}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {t.rows.map((r, i) => {
          const href = t.links?.[i];
          return (
            <tr key={i} className={`border-b last:border-0 ${t.strong?.includes(i) ? "bg-muted/40 font-medium" : ""}`}>
              {r.map((v, j) => {
                const c = t.columns[j];
                const text = showCell(v, c);
                const indent = j === 0 && t.levels?.[i] ? { paddingLeft: `${0.75 + t.levels[i] * 1.1}rem` } : undefined;
                return (
                  <td key={j} style={indent} className={`px-3 py-1.5 ${isNumeric(c) ? "text-right tabular-nums whitespace-nowrap" : ""} ${c?.kind === "date" ? "whitespace-nowrap" : ""} ${typeof v === "number" && v < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                    {/* the first cell and every number lead on: click a total to see what makes it up */}
                    {href && text && (j === 0 || typeof v === "number") ? (
                      <Link href={href} className="hover:underline">
                        {text}
                      </Link>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          );
        })}
        {!t.rows.length && (
          <tr>
            <td colSpan={t.columns.length} className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t.note ?? "Nothing in this period."}
            </td>
          </tr>
        )}
      </tbody>
      {t.total && (
        <tfoot className={scrolls ? "sticky bottom-0 z-[1] bg-card" : undefined}>
          <tr className="border-t-2 font-semibold">
            {t.total.map((v, j) => (
              <td key={j} className={`px-3 py-1.5 ${isNumeric(t.columns[j]) ? "text-right tabular-nums whitespace-nowrap" : ""} ${typeof v === "number" && v < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
                {showCell(v, t.columns[j])}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
  const panel = scrolls ? "max-h-[calc(100svh-var(--mobile-nav-h)-12rem)] overflow-auto" : "overflow-x-auto";
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card">
      {showTitle && <h2 className="border-b px-3 py-2 text-sm font-medium">{t.title}</h2>}
      {/* lists become cards on phones; a two-column statement already fits */}
      {t.columns.length > 3 ? <PhoneCards className={panel}>{table}</PhoneCards> : <div className={panel}>{table}</div>}
      {t.note && t.rows.length > 0 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t.note}</p>}
    </section>
  );
}

/** A report on screen: its headline numbers, then its tables. */
export function ReportScreen({ report }: { report: Report }) {
  const { tables } = report;
  return (
    <>
      {report.notice && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{report.notice}</p>}
      {report.kpis.length > 0 && <StatStrip items={report.kpis.map((k) => ({ label: k.label, value: showKpi(k), hint: k.hint }))} />}
      <div className="grid min-w-0 gap-3">
        {tables.map((t, i) => (
          <ScreenTable key={i} t={t} showTitle={tables.length > 1 || t.title !== report.title} />
        ))}
      </div>
    </>
  );
}

/** A report on paper: letterhead, period, headline numbers and tables. Always light, like every printed document. */
export function ReportPaper({ report, brand, generated }: { report: Report; brand: QuoteBrand; generated: string }) {
  const accent = safeColor(brand.color);
  return (
    <article className="bg-white p-6 text-[11px] leading-snug text-neutral-800 print:p-0" aria-label={report.title}>
      <header className="flex items-start justify-between gap-6 border-b-2 pb-2" style={{ borderColor: accent }}>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-neutral-900">{brand.company}</div>
          {brand.address && <div className="whitespace-pre-line text-neutral-600">{brand.address}</div>}
          {brand.trn && <div className="text-neutral-700">TRN: {brand.trn}</div>}
        </div>
        <div className="min-w-0 text-right">
          <h1 className="text-[17px] leading-tight font-bold text-neutral-900">{report.title}</h1>
          <div className="mt-0.5 text-neutral-600">{report.period}</div>
        </div>
      </header>
      {report.notice && <p className="mt-2 border border-neutral-300 px-2 py-1 text-neutral-700">{report.notice}</p>}
      {report.kpis.length > 0 && (
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          {report.kpis.map((k) => (
            <div key={k.label}>
              <dt className="text-[10px] text-neutral-500">{k.label}</dt>
              <dd className="font-semibold tabular-nums text-neutral-900">{showKpi(k)}</dd>
            </div>
          ))}
        </dl>
      )}
      {report.tables.map((t, ti) => (
        <section key={ti} className="mt-3">
          {(report.tables.length > 1 || t.title !== report.title) && <h2 className="mb-1 break-after-avoid text-[12px] font-semibold text-neutral-900">{t.title}</h2>}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-400 bg-neutral-100">
                {t.columns.map((c, i) => (
                  <th key={i} className={`px-1.5 py-1 text-[10px] font-semibold ${isNumeric(c) ? "text-right" : "text-left"}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i} className={`break-inside-avoid border-b border-neutral-200 ${t.strong?.includes(i) ? "bg-neutral-50 font-semibold" : ""}`}>
                  {r.map((v, j) => (
                    <td key={j} style={j === 0 && t.levels?.[i] ? { paddingLeft: `${0.375 + t.levels[i] * 0.8}rem` } : undefined} className={`px-1.5 py-0.5 ${isNumeric(t.columns[j]) ? "text-right tabular-nums whitespace-nowrap" : ""} ${t.columns[j]?.kind === "date" ? "whitespace-nowrap" : ""}`}>
                      {showCell(v, t.columns[j])}
                    </td>
                  ))}
                </tr>
              ))}
              {!t.rows.length && (
                <tr>
                  <td colSpan={t.columns.length} className="px-1.5 py-3 text-center text-neutral-500">
                    {t.note ?? "Nothing in this period."}
                  </td>
                </tr>
              )}
            </tbody>
            {t.total && (
              <tfoot className="[display:table-row-group]">
                <tr className="break-inside-avoid border-t-2 border-b-4 border-double border-neutral-500 font-bold">
                  {t.total.map((v, j) => (
                    <td key={j} className={`px-1.5 py-1 ${isNumeric(t.columns[j]) ? "text-right tabular-nums whitespace-nowrap" : ""}`}>
                      {showCell(v, t.columns[j])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
          {t.note && t.rows.length > 0 && <p className="mt-1 text-[10px] text-neutral-500">{t.note}</p>}
        </section>
      ))}
      <p className="mt-4 text-[10px] text-neutral-500">{generated}</p>
    </article>
  );
}
