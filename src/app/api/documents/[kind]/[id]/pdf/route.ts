import { desc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { loadAccess } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/token";
import { printPageToPdf } from "@/lib/pdf";

const isDay = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The name on the downloaded file. */
async function fileName(kind: string, id: number, credit: boolean, creditId: number | null): Promise<string> {
  if (kind === "invoice") {
    const [i] = await db.select({ number: schema.invoices.number }).from(schema.invoices).where(eq(schema.invoices.id, id));
    if (credit) {
      const [c] = await db.select({ number: schema.creditNotes.number }).from(schema.creditNotes).where(creditId ? eq(schema.creditNotes.id, creditId) : eq(schema.creditNotes.invoiceId, id)).orderBy(desc(schema.creditNotes.id)).limit(1);
      return c?.number ?? `Credit note ${i?.number ?? id}`;
    }
    return i?.number ?? `Invoice ${id}`;
  }
  if (kind === "refund") return (await db.select({ number: schema.advanceRefunds.number }).from(schema.advanceRefunds).where(eq(schema.advanceRefunds.id, id)))[0]?.number ?? `Refund ${id}`;
  if (kind === "debit-note") return (await db.select({ number: schema.debitNotes.number }).from(schema.debitNotes).where(eq(schema.debitNotes.id, id)))[0]?.number ?? `Debit note ${id}`;
  if (kind === "receipt") return (await db.select({ number: schema.payments.number }).from(schema.payments).where(eq(schema.payments.id, id)))[0]?.number ?? `Receipt ${id}`;
  if (kind === "payment-voucher") return (await db.select({ number: schema.supplierPayments.number }).from(schema.supplierPayments).where(eq(schema.supplierPayments.id, id)))[0]?.number ?? `Voucher ${id}`;
  return `Statement ${(await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, id)))[0]?.name ?? id}`;
}

const KINDS = new Set(["invoice", "receipt", "payment-voucher", "statement", "debit-note", "refund"]);

/**
 * A money document as a PDF, the file the print page gives. The print page opens with the user's own session, so who may
 * see what is decided there exactly as on screen: a document they may not open fails here too.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/documents/[kind]/[id]/pdf">) {
  if (!(await loadAccess())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { kind, id: rawId } = await ctx.params;
  const id = Number(rawId);
  if (!KINDS.has(kind) || !Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!session) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const credit = kind === "invoice" && sp.get("doc") === "credit";
  const q = new URLSearchParams();
  const creditId = credit ? Number(sp.get("cn")) || null : null;
  if (credit) q.set("doc", "credit");
  if (creditId) q.set("cn", String(creditId));
  if (kind === "statement") {
    const from = sp.get("from");
    const to = sp.get("to");
    if (isDay(from)) q.set("from", from);
    if (isDay(to)) q.set("to", to);
  }
  const query = q.toString();
  let pdf: Buffer;
  try {
    pdf = await printPageToPdf(`/print/${kind}/${id}${query ? `?${query}` : ""}`, session);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const name = `${await fileName(kind, id, credit, creditId)}.pdf`;
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
