import { type NextRequest } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { dubaiToday } from "@/lib/dates";
import { isReport, periodRange, reportToCsv } from "@/lib/reports";
import { runReport } from "@/lib/reports-data";

/** The report on screen as a CSV file for the accountant (same period and numbers as the page). Accounts team only. */
export async function GET(req: NextRequest) {
  const access = await loadAccess();
  if (!access?.finance) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const key = sp.get("r") ?? "pnl";
  if (!isReport(key)) return Response.json({ error: "Unknown report" }, { status: 400 });
  const p = periodRange(sp.get("period") ?? "this-month", dubaiToday(), sp.get("from"), sp.get("to"));
  const report = await runReport(key, p.from, p.to, p.label);
  return new Response(reportToCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zeronix-${key}-${p.from}-to-${p.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
