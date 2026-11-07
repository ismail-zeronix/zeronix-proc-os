import { type NextRequest } from "next/server";
import { loadAccess } from "@/lib/auth/session";
import { fafFile } from "@/lib/ledger/vat";
import { currentOrgId } from "@/lib/org";

const isDay = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The FTA Audit File for a period. Accountants only: it carries the whole general ledger. */
export async function GET(req: NextRequest) {
  const access = await loadAccess();
  if (!access?.finance || !access.accountant) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isDay(from) || !isDay(to) || from > to) return Response.json({ error: "Pick a period" }, { status: 400 });
  const csv = await fafFile(await currentOrgId(), from, to);
  return new Response(csv, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="FAF ${from} to ${to}.csv"`,
    },
  });
}
