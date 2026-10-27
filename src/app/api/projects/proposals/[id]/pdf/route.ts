import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { hasApp, loadAccess } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/token";
import { canSeeDeal, viewerOf } from "@/lib/auth/visibility";
import { proposalPdf } from "@/lib/proposal-pdf";
import { quotePdfName } from "@/lib/quote-email";

/**
 * Downloads the working proposal of a project as a PDF (the same page as Print, made by headless Chromium, with the
 * reference and page numbers in the footer). The customer copy is the one frozen with the quote.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/projects/proposals/[id]/pdf">) {
  if (!(await hasApp("projects"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [p] = await db
    .select({ dealId: schema.projects.dealId, number: schema.projects.number, company: schema.companies.name })
    .from(schema.proposals)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
    .innerJoin(schema.deals, eq(schema.deals.id, schema.projects.dealId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
    .where(eq(schema.proposals.id, id));
  const access = await loadAccess();
  // a proposal on someone else's project reads like one that does not exist
  if (!p || !access || !(await canSeeDeal(viewerOf(access), p.dealId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  let pdf: Buffer;
  try {
    pdf = await proposalPdf(`/print/proposal/${id}`, session, `Proposal ${p.number} (draft)`);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const name = quotePdfName(p.number, p.company, "Proposal");
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
