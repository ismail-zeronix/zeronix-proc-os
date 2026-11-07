import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/token";
import { dubaiToday } from "@/lib/dates";
import { orgProfile } from "@/lib/org";
import { printPageToPdf } from "@/lib/pdf";
import { isKnownReport, parseReportParams, reportDef, reportQuery } from "@/lib/report-centre";
import { canOpenReport } from "@/lib/report-run";

/** The report on screen as a PDF: the print page turned into a file, with page numbers. Accounts team only. */
export async function GET(req: NextRequest) {
  const access = await loadAccess();
  if (!access?.finance) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const asked = sp.get("r");
  if (asked && !isKnownReport(asked)) return NextResponse.json({ error: "Unknown report" }, { status: 400 });
  const p = parseReportParams((k) => sp.get(k), dubaiToday());
  if (!canOpenReport(p.key, access)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  const def = reportDef(p.key);
  let pdf: Buffer;
  try {
    pdf = await printPageToPdf(`/print/report/${p.key}?${reportQuery(p)}`, session, { footer: `${(await orgProfile()).legalName} · ${def?.label ?? "Report"}` });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const name = `zeronix-${p.key}-${def?.asOf ? p.to : `${p.from}-to-${p.to}`}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Length": String(pdf.length), "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
