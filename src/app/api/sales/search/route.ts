import { type NextRequest } from "next/server";
import { desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { hasApp } from "@/lib/auth/session";
import { searchCompanies } from "@/lib/sales-data";

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Sales search for the company picker (`kind=company`) and for Ctrl K (`kind=all`: companies, contacts, deals and quotes).
 */
export async function GET(req: NextRequest) {
  if (!(await hasApp("sales"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const kind = req.nextUrl.searchParams.get("kind") ?? "company";
  if (q.length < 2) return Response.json({ companies: [], contacts: [], deals: [], quotes: [] });

  if (kind === "company") return Response.json({ companies: await searchCompanies(q, 8), contacts: [], deals: [], quotes: [] });

  const [companies, contacts, deals, quotes] = await Promise.all([
    searchCompanies(q, 5),
    db
      .select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email, companyId: schema.contacts.companyId, companyName: schema.companies.name })
      .from(schema.contacts)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
      .where(or(ilike(schema.contacts.name, like(q)), ilike(schema.contacts.email, like(q)), ilike(schema.contacts.phone, like(q))))
      .limit(5),
    db
      .select({ id: schema.deals.id, title: schema.deals.title, stage: schema.deals.stage, companyName: schema.companies.name })
      .from(schema.deals)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
      .where(or(ilike(schema.deals.title, like(q)), ilike(schema.companies.name, like(q))))
      .limit(5),
    db
      .select({ id: schema.quotes.id, number: schema.quotes.number, status: schema.quotes.status, total: schema.quotes.total, companyName: schema.companies.name })
      .from(schema.quotes)
      .innerJoin(schema.deals, eq(schema.deals.id, schema.quotes.dealId))
      .innerJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
      .where(or(ilike(schema.quotes.number, like(q)), ilike(schema.companies.name, like(q))))
      .orderBy(desc(schema.quotes.createdAt))
      .limit(5),
  ]);
  return Response.json({ companies, contacts, deals, quotes });
}
