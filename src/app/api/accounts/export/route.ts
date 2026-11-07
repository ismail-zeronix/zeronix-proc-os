import { type NextRequest } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { TZ, dubaiToday } from "@/lib/dates";
import { reportToXlsx } from "@/lib/export/xlsx";
import { canExportList, isExportList, listReport, parseIds } from "@/lib/list-exports";
import { orgProfile } from "@/lib/org";
import { reportToCsv } from "@/lib/reports";

/** The rows ticked on an Accounts list, as real Excel or CSV. Accounts team only. */
export async function GET(req: NextRequest) {
  const access = await loadAccess();
  if (!access?.finance) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const list = sp.get("list") ?? "";
  if (!isExportList(list)) return Response.json({ error: "Unknown list" }, { status: 400 });
  if (!canExportList(list, access)) return Response.json({ error: "Not allowed" }, { status: 403 });
  const report = await listReport(list, parseIds(sp.get("ids")));
  const name = `zeronix-${list}-${dubaiToday()}`;
  const headers = { "Cache-Control": "no-store" };
  if (sp.get("format") === "xlsx") {
    const org = await orgProfile();
    const when = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
    const file = await reportToXlsx(report, org.legalName, `Downloaded by ${access.user.name} on ${when}. Amounts in ${org.baseCurrency}.`);
    return new Response(new Uint8Array(file), {
      headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` },
    });
  }
  return new Response(reportToCsv(report), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
}
