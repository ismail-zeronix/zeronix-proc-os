import { notFound } from "next/navigation";
import { PrintPage } from "@/components/print-page";
import { ReportPaper } from "@/components/report-view";
import { requireFinance } from "@/lib/auth/session";
import { dubaiToday, TZ } from "@/lib/dates";
import { quoteBrand } from "@/lib/quote-view";
import { parseReportParams, reportDef, reportQuery } from "@/lib/report-centre";
import { canOpenReport, runCentreReport } from "@/lib/report-run";

export const metadata = { title: "Report" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Any report of the report centre on A4 paper (sideways when it is wide), the same numbers as on screen. */
export default async function PrintReport({ params, searchParams }: PageProps<"/print/report/[key]">) {
  const access = await requireFinance();
  const key = (await params).key;
  if (!reportDef(key) || !canOpenReport(key, access)) notFound();
  const sp = await searchParams;
  const p = parseReportParams((k) => (k === "r" ? key : one(sp[k])), dubaiToday());
  const [report, brand] = await Promise.all([runCentreReport(p), quoteBrand()]);
  const qs = reportQuery(p);
  const when = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
  return (
    <PrintPage back={`/accounts/reports?${qs}`} number={report.title} pdfHref={`/api/reports/pdf?${qs}`} landscape={report.landscape}>
      <ReportPaper report={report} brand={brand} generated={`Printed by ${access.user.name} on ${when}. Amounts in AED.`} />
    </PrintPage>
  );
}
