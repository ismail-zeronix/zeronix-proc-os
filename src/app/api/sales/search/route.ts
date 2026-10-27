import { type NextRequest } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadAccess } from "@/lib/auth/session";
import { companyVisible, currentViewer, dealVisible, invoiceVisible, orderVisible, quoteVisible } from "@/lib/auth/visibility";
import { searchCompanies } from "@/lib/sales-data";

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Sales search for the company picker (`kind=company`) and for Ctrl K (`kind=all`: companies, contacts, deals and quotes).
 * Only finds what the person may see (see lib/auth/visibility.ts): deals and people with CRM, quotes and orders with
 * Accounts, every invoice at the finance level.
 */
export async function GET(req: NextRequest) {
  const access = await loadAccess();
  const crm = !!access?.apps.includes("crm");
  const docs = !!access?.apps.includes("sales");
  if (!crm && !docs) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const v = await currentViewer();
  // the accounts team finds every company (customers and opening balances); deals and people stay by deal
  const cv = await currentViewer(!!access?.finance);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const kind = req.nextUrl.searchParams.get("kind") ?? "company";
  if (q.length < 2) return Response.json({ companies: [], contacts: [], deals: [], quotes: [], orders: [], invoices: [] });

  if (kind === "company") return Response.json({ companies: await searchCompanies(cv, q, 8), contacts: [], deals: [], quotes: [], orders: [], invoices: [] });

  const accounts = !!access?.finance;
  const none = Promise.resolve([]);
  const [companies, contacts, deals, quotes, orders, invoices] = await Promise.all([
    searchCompanies(cv, q, 5),
    !crm ? none : db
      .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, companyId: schema.contacts.companyId, companyName: schema.companies.name })
      .from(schema.contacts)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
      .where(
        and(
          or(ilike(schema.contacts.name, like(q)), ilike(schema.contacts.email, like(q)), ilike(schema.contacts.phone, like(q))),
          companyVisible(v, schema.companies.id),
        ),
      )
      .limit(5),
    !crm ? none : db
      .select({ id: schema.deals.id, title: schema.deals.title, stage: schema.deals.stage, companyName: schema.companies.name })
      .from(schema.deals)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
      .where(and(or(ilike(schema.deals.title, like(q)), ilike(schema.companies.name, like(q))), dealVisible(v, schema.deals.id)))
      .limit(5),
    !docs ? none : db
      .select({ id: schema.quotes.id, number: schema.quotes.number, status: schema.quotes.status, total: schema.quotes.total, companyName: schema.companies.name })
      .from(schema.quotes)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.quotes.companyId))
      .where(and(or(ilike(schema.quotes.number, like(q)), ilike(schema.companies.name, like(q))), quoteVisible(v, { dealId: schema.quotes.dealId, ownerId: schema.quotes.ownerId, createdBy: schema.quotes.createdBy })))
      .orderBy(desc(schema.quotes.createdAt))
      .limit(5),
    !docs ? none : db
      .select({ id: schema.salesOrders.id, number: schema.salesOrders.number, status: schema.salesOrders.status, total: schema.salesOrders.total, companyName: schema.companies.name })
      .from(schema.salesOrders)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.salesOrders.companyId))
      .where(
        and(
          or(ilike(schema.salesOrders.number, like(q)), ilike(schema.salesOrders.customerRef, like(q)), ilike(schema.salesOrders.dnNumber, like(q))),
          orderVisible(v, { dealId: schema.salesOrders.dealId, quoteId: schema.salesOrders.quoteId }),
        ),
      )
      .orderBy(desc(schema.salesOrders.createdAt))
      .limit(5),
    !docs ? none : db
      .select({ id: schema.invoices.id, number: schema.invoices.number, status: schema.invoices.status, total: schema.invoices.total, companyName: schema.invoices.customerName })
      .from(schema.invoices)
      .where(
        and(
          or(ilike(schema.invoices.number, like(q)), ilike(schema.invoices.customerRef, like(q))),
          accounts ? undefined : invoiceVisible(v, { dealId: schema.invoices.dealId, orderId: schema.invoices.orderId }),
        ),
      )
      .orderBy(desc(schema.invoices.createdAt))
      .limit(5),
  ]);
  // invoices open in Accounts; without it, the printable invoice
  return Response.json({ companies, contacts, deals, quotes, orders, invoices: invoices.map((i) => ({ ...i, href: accounts ? `/accounts/invoices/${i.id}` : `/print/invoice/${i.id}` })) });
}
