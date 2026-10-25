import { FilePlus2, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLink } from "@/components/app-link";
import { BackButton } from "@/components/back-button";
import { InvoiceTable } from "@/components/invoice-table";
import { OpeningInvoiceDialog } from "@/components/opening-ui";
import { StatementDocument } from "@/components/money-documents";
import { InvoiceStateBadge, OrderStatusBadge } from "@/components/order-bits";
import { QuoteStatusBadge } from "@/components/quote-bits";
import { StatStrip } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UrlTabs } from "@/components/url-tabs";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { companyBalance, listInvoices, statement } from "@/lib/accounts-data";
import { requireApp } from "@/lib/auth/session";
import { canSeeCompany, financeViewerOf } from "@/lib/auth/visibility";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { listOrders } from "@/lib/orders-data";
import { money } from "@/lib/quotation";
import { listQuotes } from "@/lib/quotes-data";
import { quoteBrand } from "@/lib/quote-view";
import { CompanyDialog } from "../../../crm/companies/company-ui";

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const metadata = { title: "Customer · Zeronix Sales" };

/**
 * One customer in Sales: billing details, what they owe, their quotes, orders and invoices, and the statement of
 * account for a period (print or save as PDF). The same company record as in CRM, never a copy.
 */
export default async function CustomerAccountPage({ params, searchParams }: PageProps<"/sales/customers/[id]">) {
  const access = await requireApp("sales");
  const { apps, finance } = access;
  const v = financeViewerOf(access);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1 || !(await canSeeCompany(v, id))) notFound();
  const sp = await searchParams;
  const today = dubaiToday();
  const to = isDay(sp.to) ? sp.to : today;
  const from = isDay(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 4)}-01-01`;
  const [s, allInvoices, bal, brand, [company], orders, allQuotes] = await Promise.all([
    statement(id, from, to),
    listInvoices({ companyId: id }),
    companyBalance(id),
    quoteBrand(),
    db.select().from(schema.companies).where(eq(schema.companies.id, id)),
    listOrders(v, { companyId: id }),
    listQuotes(v),
  ]);
  if (!s || !company) notFound();
  // without Accounts: only the invoices of orders they may see
  const visibleOrders = new Set(orders.map((o) => o.id));
  const invoices = finance ? allInvoices : allInvoices.filter((i) => i.orderId != null && visibleOrders.has(i.orderId));
  const quotes = allQuotes.filter((q) => q.companyId === id);
  const paidIn = s.lines.filter((l) => l.kind === "payment").reduce((n, l) => n + l.credit, 0);
  const invoicedIn = s.lines.filter((l) => l.kind === "invoice").reduce((n, l) => n + l.debit, 0);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback="/sales/customers" />
        <div className="grid min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-base font-semibold">{company.name}</h1>
          <span className="truncate text-xs text-muted-foreground">
            {[company.trn ? `TRN ${company.trn}` : "No TRN saved", company.address || company.emirate].filter(Boolean).join(" · ")}
            {apps.includes("crm") && (
              <>
                {" · "}
                <AppLink href={`/crm/companies/${id}`} className="hover:underline">
                  contacts and deals
                </AppLink>
              </>
            )}
          </span>
        </div>
        {finance && <OpeningInvoiceDialog company={{ id: company.id, name: company.name }} />}
        <Button size="sm" nativeButton={false} render={<Link href={`/sales/quotes/new?company=${company.id}`} />} title="A quick quote for this customer, no deal needed">
          <FilePlus2 /> New quote
        </Button>
        <CompanyDialog
          company={{ id: company.id, name: company.name, industry: company.industry, emirate: company.emirate, website: company.website, phone: company.phone, tradeLicenseNo: company.tradeLicenseNo, trn: company.trn, address: company.address, source: company.source, notes: company.notes }}
          trigger={
            <Button variant="outline" size="sm" title="TRN, billing address and other details">
              <Pencil /> Billing details
            </Button>
          }
        />
      </div>

      <StatStrip
        items={[
          { label: "Owes today", value: money(bal.owed) },
          { label: "Overdue", value: money(bal.overdue) },
          { label: "Invoiced in the period", value: money(invoicedIn) },
          { label: "Paid in the period", value: money(paidIn) },
        ]}
      />

      <UrlTabs
        initial={sp.tab}
        tabs={[
          {
            key: "invoices",
            label: `Invoices (${invoices.length})`,
            content: <InvoiceTable rows={invoices} showCustomer={false} finance={finance} empty="No invoices for this customer." />,
          },
          {
            key: "orders",
            label: `Orders (${orders.length})`,
            content: (
              <ul className="divide-y rounded-lg border bg-card">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/sales/orders/${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-muted">
                      <span className="font-mono font-medium">{o.number}</span>
                      <OrderStatusBadge status={o.status} />
                      {o.invoice && <InvoiceStateBadge state={o.invoice.state} />}
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{o.dealTitle}</span>
                      <span className="tabular-nums">{money(o.total)}</span>
                    </Link>
                  </li>
                ))}
                {!orders.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No orders yet.</li>}
              </ul>
            ),
          },
          {
            key: "quotes",
            label: `Quotes (${quotes.length})`,
            content: (
              <ul className="divide-y rounded-lg border bg-card">
                {quotes.map((q) => (
                  <li key={q.id}>
                    <Link href={`/sales/quotes/${q.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-muted">
                      <span className="font-mono font-medium">{q.number}</span>
                      <QuoteStatusBadge status={q.shownStatus} />
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{q.dealTitle}</span>
                      <span className="text-xs text-muted-foreground">valid until {dayLabel(q.validUntil)}</span>
                      <span className="tabular-nums">{money(q.total)}</span>
                    </Link>
                  </li>
                ))}
                {!quotes.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No quotes yet.</li>}
              </ul>
            ),
          },
          {
            key: "statement",
            label: "Statement",
            content: (
              <section className="grid gap-2 rounded-xl border bg-card p-3" aria-label="Statement of account">
                <form className="flex flex-wrap items-end gap-2" action={`/sales/customers/${id}`}>
                  <input type="hidden" name="tab" value="statement" />
                  <h2 className="mr-auto text-sm font-semibold">Statement of account</h2>
                  <div className="grid gap-1">
                    <Label htmlFor="st-from" className="text-xs">
                      From
                    </Label>
                    <Input id="st-from" name="from" type="date" defaultValue={from} className="h-8 w-40" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="st-to" className="text-xs">
                      To
                    </Label>
                    <Input id="st-to" name="to" type="date" defaultValue={to} max={today} className="h-8 w-40" />
                  </div>
                  <Button type="submit" variant="outline" size="sm">
                    Show
                  </Button>
                  <Button size="sm" nativeButton={false} render={<Link href={`/print/statement/${id}?from=${from}&to=${to}`} target="_blank" />}>
                    <Printer /> Print / PDF
                  </Button>
                </form>
                <div className="overflow-hidden rounded-lg border">
                  <StatementDocument brand={brand} s={{ customer: { name: s.company.name, emirate: s.company.emirate, trn: s.company.trn }, from, to, opening: s.opening, lines: s.lines, closing: s.closing }} />
                </div>
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}
