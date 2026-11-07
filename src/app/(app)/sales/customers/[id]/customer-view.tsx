import { FilePlus2, Pencil, Printer, ReceiptText, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplyAdvanceDialog, RefundAdvanceDialog, RefundList } from "@/components/allocation-ui";
import { bankAccountOptions } from "@/lib/ledger/data";
import { currentOrgId } from "@/lib/org";
import { listRefunds } from "@/lib/refunds-data";
import { AppLink } from "@/components/app-link";
import { BackButton } from "@/components/back-button";
import { CustomerOwnersMenu } from "@/components/customer-owners";
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
import { companyBalance, customerAdvances, listInvoices, listPayments, openInvoices, statement } from "@/lib/accounts-data";
import type { Access } from "@/lib/auth/session";
import { canSeeCompany, financeViewerOf } from "@/lib/auth/visibility";
import { companyOwners } from "@/lib/company-owners";
import { dayLabel, dubaiToday } from "@/lib/dates";
import { methodLabel } from "@/lib/invoicing";
import { listOrders } from "@/lib/orders-data";
import { longDay, money } from "@/lib/quotation";
import { listQuotes } from "@/lib/quotes-data";
import { quoteBrand } from "@/lib/quote-view";
import { param, type SalesBase } from "@/lib/sales-base";
import { customerOwnerUsers } from "@/lib/sales-data";
import { CompanyDialog } from "../../../crm/companies/company-ui";

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * One customer in Sales: billing details, what they owe, their quotes, orders and invoices, and the statement of
 * account for a period (print or save as PDF). The same company record as in CRM, never a copy.
 */
export async function CustomerAccountView({ access, base, id, searchParams: sp }: { access: Access; base: SalesBase; id: number; searchParams: Record<string, string | string[] | undefined> }) {
  const { apps, finance } = access;
  const v = financeViewerOf(access);
  if (!Number.isInteger(id) || id < 1 || !(await canSeeCompany(v, id))) notFound();
  const today = dubaiToday();
  const to = isDay(sp.to) ? sp.to : today;
  const from = isDay(sp.from) && sp.from <= to ? sp.from : `${to.slice(0, 4)}-01-01`;
  const [s, allInvoices, bal, brand, [company], orders, allQuotes, owners, users, payments, advances, open] = await Promise.all([
    statement(id, from, to),
    listInvoices({ companyId: id }),
    companyBalance(id),
    quoteBrand(),
    db.select().from(schema.companies).where(eq(schema.companies.id, id)),
    listOrders(v, { companyId: id }),
    listQuotes(v),
    companyOwners(id),
    customerOwnerUsers(),
    finance ? listPayments({ companyId: id }) : Promise.resolve([]),
    finance ? customerAdvances(id) : Promise.resolve([]),
    finance ? openInvoices(id) : Promise.resolve([]),
  ]);
  const [accounts, refunds] = finance ? await Promise.all([currentOrgId().then(bankAccountOptions), listRefunds({ companyId: id })]) : [[], []];
  if (!s || !company) notFound();
  // without Accounts: only the invoices of orders they may see
  const visibleOrders = new Set(orders.map((o) => o.id));
  const invoices = finance ? allInvoices : allInvoices.filter((i) => i.orderId != null && visibleOrders.has(i.orderId));
  const quotes = allQuotes.filter((q) => q.companyId === id);
  const paidIn = s.lines.filter((l) => l.kind === "payment").reduce((n, l) => n + l.credit, 0);
  const invoicedIn = s.lines.filter((l) => l.kind === "invoice").reduce((n, l) => n + l.debit, 0);
  // open on the first tab with something in it
  const tab = param(sp.tab) ?? (invoices.length ? "invoices" : orders.length ? "orders" : quotes.length ? "quotes" : "invoices");

  const advance = advances.reduce((n, a) => n + a.left, 0);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackButton fallback={`${base}/customers`} />
        <div className="grid min-w-48 flex-1 leading-tight">
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
        <CustomerOwnersMenu companyId={id} owners={owners} users={users} canEdit={access.seesAll} />
        {finance && <OpeningInvoiceDialog company={{ id: company.id, name: company.name }} />}
        {advances.length > 0 && open.length > 0 && <ApplyAdvanceDialog party="customer" advances={advances} documents={open} />}
        {finance && advances.length > 0 && <RefundAdvanceDialog party="customer" advances={advances} accounts={accounts} />}
        <Button variant={finance ? "outline" : "default"} size="sm" nativeButton={false} render={<Link href={`${base}/quotes/new?company=${company.id}`} />} title="A quick quote for this customer, no deal needed">
          <FilePlus2 /> New quote
        </Button>
        {finance && (
          <>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/accounts/invoices/new?company=${company.id}`} />}>
              <ReceiptText /> New invoice
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href={`/accounts/payments/new?company=${company.id}`} />}>
              <Wallet /> New receipt
            </Button>
          </>
        )}
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
          ...(advance > 0 ? [{ label: "Paid in advance", value: money(advance), hint: `${advances.length} receipt${advances.length === 1 ? "" : "s"} not used yet` }] : []),
        ]}
      />

      <UrlTabs
        initial={tab}
        tabs={[
          {
            key: "invoices",
            label: `Invoices (${invoices.length})`,
            content: <InvoiceTable rows={invoices} showCustomer={false} finance={finance} empty="No invoices for this customer." />,
          },
          {
            key: "orders",
            label: `Sales orders (${orders.length})`,
            content: (
              <ul className="divide-y rounded-lg border bg-card">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`${base}/orders/${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-muted">
                      <span className="font-mono font-medium">{o.number}</span>
                      <OrderStatusBadge status={o.status} />
                      {o.invoice && <InvoiceStateBadge state={o.invoice.state} />}
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{o.dealTitle || "Instant quote"}</span>
                      <span className="tabular-nums">{money(o.total)}</span>
                    </Link>
                  </li>
                ))}
                {!orders.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No sales orders yet.</li>}
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
                    <Link href={`${base}/quotes/${q.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-muted">
                      <span className="font-mono font-medium">{q.number}</span>
                      <QuoteStatusBadge status={q.shownStatus} />
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{q.dealTitle || "Instant quote"}</span>
                      <span className="text-xs text-muted-foreground">valid until {dayLabel(q.validUntil)}</span>
                      <span className="tabular-nums">{money(q.total)}</span>
                    </Link>
                  </li>
                ))}
                {!quotes.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No quotes yet.</li>}
              </ul>
            ),
          },
          ...(finance
            ? [
                ...(refunds.length ? [{ key: "refunds", label: `Refunds (${refunds.length})`, content: <RefundList rows={refunds} party="customer" /> }] : []),
                {
                  key: "payments",
                  label: `Payments (${payments.length})`,
                  content: (
                    <ul className="divide-y rounded-lg border bg-card">
                      {payments.map((p) => (
                        <li key={p.id}>
                          <Link href={`/print/receipt/${p.id}`} target="_blank" className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm hover:bg-muted ${p.voidedAt ? "text-muted-foreground line-through" : ""}`}>
                            <span className="font-mono font-medium">{p.number}</span>
                            <span className="text-xs text-muted-foreground">
                              {longDay(p.paidOn)} · {methodLabel(p.method)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {p.documents.map((d) => d.number).join(", ")}
                              {p.advance > 0 ? `${p.documents.length ? " · " : ""}advance ${money(p.advance)}` : ""}
                            </span>
                            <span className="tabular-nums">{money(p.amount)}</span>
                          </Link>
                        </li>
                      ))}
                      {!payments.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No payments yet.</li>}
                    </ul>
                  ),
                },
              ]
            : []),
          {
            key: "statement",
            label: "Statement",
            content: (
              <section className="grid gap-2 rounded-xl border bg-card p-3" aria-label="Statement of account">
                <form className="flex flex-wrap items-end gap-2" action={`${base}/customers/${id}`}>
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
