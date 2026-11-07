import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { InvoiceForm } from "@/components/invoice-form";
import { db, schema } from "@/db";
import { nextInvoiceNumber } from "@/lib/accounts-data";
import { requireFinance } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { invoiceOfQuote, orderOfQuote } from "@/lib/orders-data";
import { projectOfDeal } from "@/lib/projects-data";
import { getQuote, quoteDefaults, quoteLines } from "@/lib/quotes-data";
import { param } from "@/lib/sales-base";
import { getSetting } from "@/lib/settings";

export const metadata = { title: "New invoice · Zeronix Accounts" };

/** A tax invoice with no sales order: typed directly, for a customer (`?company=`), or filled in from a quote (`?quote=`). */
export default async function NewInvoicePage({ searchParams }: PageProps<"/accounts/invoices/new">) {
  const access = await requireFinance();
  const sp = await searchParams;
  const quoteId = Number(param(sp.quote)) || 0;
  const companyParam = Number(param(sp.company)) || 0;
  const [nextNumber, ourTrn, termsSetting, defaults] = await Promise.all([nextInvoiceNumber(), getSetting("quote_trn"), getSetting("default_terms_days"), quoteDefaults()]);
  const q = quoteId ? await getQuote(quoteId, financeViewerOf(access)) : null;
  if (quoteId && !q) notFound();
  if (q) {
    // already something else: go and look at it
    const [order, invoice] = await Promise.all([orderOfQuote(q.id), invoiceOfQuote(q.id)]);
    if (order) redirect(`/accounts/orders/${order.id}`);
    if (invoice) redirect(`/accounts/invoices/${invoice.id}`);
  }
  const companyId = q?.companyId ?? companyParam;
  const [company] = companyId ? await db.select({ id: schema.companies.id, name: schema.companies.name, address: schema.companies.address, emirate: schema.companies.emirate, trn: schema.companies.trn }).from(schema.companies).where(eq(schema.companies.id, companyId)) : [];
  if (companyId && !company) notFound();
  const [lines, project] = q ? await Promise.all([quoteLines(q.id), q.dealId ? projectOfDeal(q.dealId) : Promise.resolve(null)]) : [[], null];
  const lineKind: "product" | "service" = project ? "service" : "product";

  return (
    <InvoiceForm
      nextNumber={nextNumber}
      ourTrn={ourTrn}
      initial={{
        company: company ? { id: company.id, name: company.name } : null,
        address: company ? company.address || (company.emirate ? `${company.emirate}, United Arab Emirates` : "") : "",
        trn: company?.trn ?? "",
        quote: q ? { id: q.id, number: q.number } : null,
        termsDays: q?.termsDays ?? Math.max(0, Math.floor(Number(termsSetting)) || 0),
        vatPct: q?.vatPct ?? defaults.vatPct,
        lines: lines.map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, lineKind })),
      }}
    />
  );
}
