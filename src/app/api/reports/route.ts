import { type NextRequest } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { dubaiToday, TZ } from "@/lib/dates";
import { reportToXlsx } from "@/lib/export/xlsx";
import { orgProfile } from "@/lib/org";
import { isKnownReport, parseReportParams, reportDef } from "@/lib/report-centre";
import { canOpenReport, runCentreReport } from "@/lib/report-run";
import { reportToCsv } from "@/lib/reports";

/** The report on screen as a file for the accountant: real Excel, or CSV (same period and numbers as the page). Accounts team only. */
export async function GET(req: NextRequest) {
  const access = await loadAccess();
  if (!access?.finance) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const asked = sp.get("r");
  const p = parseReportParams((k) => sp.get(k), dubaiToday());
  // a report name this version does not know is a mistake, not a request for the default report
  if (asked && !isKnownReport(asked)) return Response.json({ error: "Unknown report" }, { status: 400 });
  if (!canOpenReport(p.key, access)) return Response.json({ error: "Not allowed" }, { status: 403 });
  const report = await runCentreReport({ ...p, full: true });
  const name = `zeronix-${p.key}-${reportDef(p.key)?.asOf ? p.to : `${p.from}-to-${p.to}`}`;
  const headers = { "Cache-Control": "no-store" };
  if (sp.get("format") === "xlsx") {
    const org = await orgProfile();
    const when = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
    const file = await reportToXlsx(report, org.legalName, `Downloaded by ${access.user.name} on ${when}. Amounts in ${org.baseCurrency}.`);
    return new Response(new Uint8Array(file), {
      headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` },
    });
  }
  return new Response(reportToCsv(report), {
    headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
  });
}
