import { FileDown, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { ExportButton } from "@/components/export-button";
import { ReportNav } from "@/components/report-nav";
import { ReportScreen } from "@/components/report-view";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { requireFinance } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { ledgerIsOn, reportPickOptions } from "@/lib/ledger/reports/data";
import { parseReportParams, REPORT_GROUPS, reportDef, reportQuery, type ReportParams } from "@/lib/report-centre";
import { canOpenReport, runCentreReport } from "@/lib/report-run";
import { PERIODS } from "@/lib/reports";

export const metadata = { title: "Reports · Zeronix Accounts" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Moving to another report keeps the period being looked at (not the account or customer picked). */
function hrefTo(p: ReportParams, key: string) {
  const q = new URLSearchParams({ r: key });
  if (!reportDef(p.key)?.asOf && !reportDef(key)?.asOf) {
    if (p.periodKey === "custom") {
      q.set("from", p.from);
      q.set("to", p.to);
    } else q.set("period", p.periodKey);
  }
  return `/accounts/reports?${q}`;
}

const PICK_LABELS = { account: "All accounts", customer: "Pick a customer", supplier: "Pick a supplier" } as const;

/**
 * The report centre: every Accounts report in one place, with the same period controls and the same way out (print, PDF,
 * Excel, CSV). Numbers open what is behind them: a total its ledger, a ledger line its entry, an entry its document.
 */
export default async function ReportsPage({ searchParams }: PageProps<"/accounts/reports">) {
  const access = await requireFinance();
  const sp = await searchParams;
  // until the ledger is on, the reports that read it are empty: start on one that has something to show
  const fallback = one(sp.r) ? "pl" : (await ledgerIsOn()) ? "pl" : "aged-ar";
  const p = parseReportParams((k) => one(sp[k]), dubaiToday(), fallback);
  if (!canOpenReport(p.key, access)) notFound();
  const def = reportDef(p.key);
  const [report, options] = await Promise.all([runCentreReport(p), def?.pick ? reportPickOptions(def.pick) : Promise.resolve([])]);
  const qs = reportQuery(p);
  const pickName = def?.pick === "account" ? "account" : "party";
  const picked = def?.pick === "account" ? p.account : p.party;
  const groups = REPORT_GROUPS.map((g) => ({
    label: g.label,
    reports: g.reports.filter((r) => canOpenReport(r.key, access)).map((r) => ({ key: r.key, label: r.label, hint: r.hint, href: hrefTo(p, r.key) })),
  })).filter((g) => g.reports.length);

  // what the period and picker forms must carry along so nothing else on the page changes
  const keep = (without: string[]) => [...new URLSearchParams(qs).entries()].filter(([k]) => !without.includes(k));

  return (
    <div className="grid min-w-0 items-start gap-3 md:grid-cols-[13.5rem_minmax(0,1fr)]">
      <ReportNav groups={groups} current={p.key} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-sm font-semibold">{report.title}</h1>
          <span className="text-xs text-muted-foreground">{report.period}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="icon-sm" nativeButton={false} render={<a href={`/print/report/${p.key}?${qs}`} target="_blank" rel="noopener" />} aria-label="Print" title="Print">
              <Printer />
            </Button>
            <ExportButton variant="outline" size="icon-sm" url={`/api/reports/pdf?${qs}`} label={`${report.title} (PDF)`} aria-label="Download PDF" title="Download PDF">
              <FileDown />
            </ExportButton>
            <ExportButton variant="outline" size="icon-sm" url={`/api/reports?${qs}&format=xlsx`} label={`${report.title} (Excel)`} aria-label="Download Excel" title="Download Excel (.xlsx)">
              <FileSpreadsheet />
            </ExportButton>
            <ExportButton variant="outline" size="icon-sm" url={`/api/reports?${qs}&format=csv`} label={`${report.title} (CSV)`} aria-label="Download CSV" title="Download CSV">
              <FileText />
            </ExportButton>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {def?.asOf ? (
            <form className="flex items-center gap-1.5" action="/accounts/reports">
              {keep(["to"]).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <span className="text-xs text-muted-foreground">As of</span>
              <Input name="to" type="date" defaultValue={p.to} className="h-8 w-36" aria-label="As of" />
              <Button type="submit" variant="outline" size="sm">
                Show
              </Button>
            </form>
          ) : (
            <>
              <Segmented
                items={PERIODS.map((x) => {
                  const q = new URLSearchParams(keep(["period", "from", "to"]));
                  q.set("period", x.key);
                  return { href: `/accounts/reports?${q}`, label: x.label, title: x.label, active: p.periodKey === x.key };
                })}
              />
              <form className="flex items-center gap-1.5" action="/accounts/reports">
                {keep(["period", "from", "to"]).map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
                <Input name="from" type="date" defaultValue={p.from} className="h-8 w-36" aria-label="From" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input name="to" type="date" defaultValue={p.to} className="h-8 w-36" aria-label="To" />
                <Button type="submit" variant="outline" size="sm">
                  Show
                </Button>
              </form>
            </>
          )}
          {def?.compare && (
            <Segmented
              items={(
                [
                  ["none", "No comparison"],
                  ["prev", def.asOf ? "Month before" : "Previous period"],
                  ["year", "Last year"],
                ] as const
              ).map(([mode, label]) => ({ href: `/accounts/reports?${reportQuery(p, { compare: mode === "none" ? "" : mode })}`, label, title: `Compare with: ${label}`, active: p.compare === mode }))}
            />
          )}
          {def?.pick && (
            <form className="flex items-center gap-1.5" action="/accounts/reports">
              {keep(["account", "party"]).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <NativeSelect size="sm" name={pickName} defaultValue={picked ? String(picked) : ""} aria-label={PICK_LABELS[def.pick]} className="max-w-64">
                <NativeSelectOption value="">{PICK_LABELS[def.pick]}</NativeSelectOption>
                {options.map((o) => (
                  <NativeSelectOption key={o.id} value={String(o.id)}>
                    {o.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button type="submit" variant="outline" size="sm">
                Show
              </Button>
            </form>
          )}
        </div>

        <ReportScreen report={report} />
      </div>
    </div>
  );
}
