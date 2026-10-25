import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasApp, loadAccess } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/token";
import { viewerOf } from "@/lib/auth/visibility";
import { printPageToPdf } from "@/lib/pdf";
import { proposalPdf } from "@/lib/proposal-pdf";
import { snapshotOfQuote } from "@/lib/proposals-data";
import { quotePdfName } from "@/lib/quote-email";
import { getQuote } from "@/lib/quotes-data";

/** Downloads a quote as the customer gets it: a project quote as its frozen proposal, a product quote as the quotation. */
export async function GET(_req: Request, ctx: RouteContext<"/api/quotes/[id]/pdf">) {
  if (!(await hasApp("accounts")) && !(await hasApp("projects"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await ctx.params).id);
  const access = await loadAccess();
  // a quote on someone else's deal reads like one that does not exist
  const q = Number.isInteger(id) && id > 0 && access ? await getQuote(id, viewerOf(access)) : null;
  if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  const snap = await snapshotOfQuote(q.id);
  let pdf: Buffer;
  try {
    pdf = snap ? await proposalPdf(`/print/quote/${q.id}`, session, `Quotation No. ${q.number}`) : await printPageToPdf(`/print/quote/${q.id}`, session);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const name = quotePdfName(q.number, q.company.name, snap ? "Proposal" : "Quotation");
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
