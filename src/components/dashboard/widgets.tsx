import { Building2, FilePlus2, HandCoins, ReceiptText, ShieldCheck, TriangleAlert, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { cache, type ReactNode } from "react";
import { HBarPanel } from "@/components/charts/hbar-panel";
import { TrendPanel } from "@/components/charts/trend-panel";
import { InvoiceStateBadge } from "@/components/order-bits";
import { QuoteStatusBadge } from "@/components/quote-bits";
import { listPayments, receivables } from "@/lib/accounts-data";
import { booksState, costsByCategory, ledgerBalances, ledgerByMonth, ledgerResult, ledgerVat, moneyBetween, moneyByMonth, salesBetween, salesByMonth, soldWithoutCost, topCustomers, topSuppliers } from "@/lib/accounts-dashboard";
import type { Access } from "@/lib/auth/session";
import { financeViewerOf } from "@/lib/auth/visibility";
import { dubaiToday } from "@/lib/dates";
import { widgetDef } from "@/lib/dashboard-widgets";
import { ledgerChecks } from "@/lib/ledger/opening-data";
import { listOrders } from "@/lib/orders-data";
import { categoryLabel } from "@/lib/purchases";
import { listSupplierPayments, payables } from "@/lib/purchases-data";
import { longDay, money, round2 } from "@/lib/quotation";
import { listQuotes } from "@/lib/quotes-data";
import { compareRange } from "@/lib/report-centre";
import { monthLabel, monthsBetween, pct } from "@/lib/reports";

export interface WidgetContext {
  access: Access;
  orgId: number;
  /** The period picked at the top of the overview. */
  period: { key: string; from: string; to: string; label: string };
}

const NO_LEDGER = "Switch the ledger on in Settings";
// several widgets read the same lists; one page reads them once
const cachedReceivables = cache(receivables);
const cachedPayables = cache(payables);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** A headline number: label, value and one line of context, opening what it adds up. */
function Tile({ label, value, hint, href }: { label: string; value: ReactNode; hint?: string; href: string }) {
  return (
    <Link href={href} className="flex h-full min-w-0 flex-col rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-base font-semibold tracking-tight tabular-nums sm:text-xl md:text-2xl">{value}</span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </Link>
  );
}

/** A list widget: at most a few rows and a way to everything. */
function ListCard({ title, hint, href, empty, children, count }: { title: string; hint?: string; href: string; empty: string; children: ReactNode[]; count?: number }) {
  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border bg-card">
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">{title}</h2>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Link href={href} className="shrink-0 text-xs font-medium hover:underline">
          {count && count > children.length ? `All ${count}` : "View all"}
        </Link>
      </header>
      {children.length ? <ul className="divide-y border-t text-sm">{children}</ul> : <p className="flex-1 border-t px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

function Row({ href, title, sub, right, badge, external }: { href: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; badge?: ReactNode; external?: boolean }) {
  return (
    <li>
      <Link href={href} target={external ? "_blank" : undefined} className="flex items-center gap-3 px-4 py-1.5 hover:bg-muted/50">
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-medium">{title}</span>
          {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
        </span>
        {badge}
        {right && <span className="shrink-0 tabular-nums">{right}</span>}
      </Link>
    </li>
  );
}

/** "12% up on the period before", or nothing when there is nothing to compare with. */
function change(now: number, before: number): string {
  if (!before) return now ? "Nothing in the period before" : "Nothing in the period before either";
  const p = Math.round(((now - before) / Math.abs(before)) * 100);
  return p === 0 ? "Same as the period before" : `${Math.abs(p)}% ${p > 0 ? "up on" : "down on"} the period before`;
}

const lastYear = () => {
  const months = monthsBetween(`${Number(dubaiToday().slice(0, 4)) - 1}-${dubaiToday().slice(5, 7)}-01`, dubaiToday()).slice(-12);
  const [y, m] = months[months.length - 1].split("-").map(Number);
  return { months, from: `${months[0]}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
};

const reportHref = (r: string, c: WidgetContext) => `/accounts/reports?r=${r}&period=${c.period.key}`;

type Render = (c: WidgetContext) => Promise<ReactNode>;

const WIDGETS: Record<string, Render> = {
  cash: async (c) => {
    const [b, s] = await Promise.all([ledgerBalances(c.orgId), booksState(c.orgId)]);
    return <Tile label="Cash and bank" value={s.on ? money(b.cash) : "-"} hint={s.on ? "In the bank and cash boxes today" : NO_LEDGER} href="/accounts/reports?r=bs" />;
  },
  receivable: async () => {
    const r = await cachedReceivables();
    return <Tile label="Customers owe" value={money(r.owed)} hint={`${plural(r.open.length, "invoice")} not fully paid`} href="/accounts/invoices" />;
  },
  overdue: async () => {
    const r = await cachedReceivables();
    const n = r.open.filter((i) => i.state.key === "overdue").length;
    return <Tile label="Overdue from customers" value={money(r.overdue)} hint={n ? `${plural(n, "invoice")} past the due date` : "Nothing late"} href="/accounts/invoices?view=overdue" />;
  },
  payable: async () => {
    const p = await cachedPayables();
    return <Tile label="We owe suppliers" value={money(p.owed)} hint={p.overdue ? `${money(p.overdue)} overdue` : `${plural(p.open.length, "bill")} to pay`} href="/accounts/bills" />;
  },
  "bills-due": async () => {
    const p = await cachedPayables();
    return <Tile label="Bills due soon" value={money(p.dueSoon)} hint="In the next 7 days" href="/accounts/bills?sort=due&dir=asc" />;
  },
  sales: async (c) => {
    const prev = compareRange(c.period.from, c.period.to, "prev");
    const [now, before] = await Promise.all([salesBetween(c.period.from, c.period.to), salesBetween(prev.from, prev.to)]);
    return <Tile label={`Sales, ${c.period.label.toLowerCase()}`} value={money(now.net)} hint={change(now.net, before.net)} href={reportHref("invoices", c)} />;
  },
  profit: async (c) => {
    const [r, s] = await Promise.all([ledgerResult(c.orgId, c.period.from, c.period.to), booksState(c.orgId)]);
    return <Tile label={`Net profit, ${c.period.label.toLowerCase()}`} value={s.on ? money(r.profit) : "-"} hint={!s.on ? NO_LEDGER : r.income ? `${pct(r.profit, r.income)}% of income` : "No income in this period"} href={reportHref("pl", c)} />;
  },
  margin: async (c) => {
    const [r, s] = await Promise.all([ledgerResult(c.orgId, c.period.from, c.period.to), booksState(c.orgId)]);
    return <Tile label={`Gross margin, ${c.period.label.toLowerCase()}`} value={s.on && r.income ? `${pct(r.gross, r.income)}%` : "-"} hint={s.on ? `${money(r.gross)} gross profit` : NO_LEDGER} href={reportHref("pl", c)} />;
  },
  expenses: async (c) => {
    const [r, s] = await Promise.all([ledgerResult(c.orgId, c.period.from, c.period.to), booksState(c.orgId)]);
    return <Tile label={`Running costs, ${c.period.label.toLowerCase()}`} value={s.on ? money(r.expenses) : "-"} hint={s.on ? "Not counting cost of sales" : NO_LEDGER} href={reportHref("expenses", c)} />;
  },
  collected: async (c) => {
    const m = await moneyBetween(c.period.from, c.period.to);
    return <Tile label={`Money received, ${c.period.label.toLowerCase()}`} value={money(m.in)} hint="Receipts, advances included" href={reportHref("receipts", c)} />;
  },
  "paid-out": async (c) => {
    const m = await moneyBetween(c.period.from, c.period.to);
    return <Tile label={`Money paid out, ${c.period.label.toLowerCase()}`} value={money(m.out)} hint="Payment vouchers" href={reportHref("payments-made", c)} />;
  },
  vat: async (c) => {
    const [v, s] = await Promise.all([ledgerVat(c.orgId, c.period.from, c.period.to), booksState(c.orgId)]);
    return <Tile label={v.net < 0 ? `VAT to reclaim, ${c.period.label.toLowerCase()}` : `VAT to pay, ${c.period.label.toLowerCase()}`} value={s.on ? money(Math.abs(v.net)) : "-"} hint={s.on ? `${money(v.output)} on sales, ${money(v.input)} on purchases` : NO_LEDGER} href={reportHref("vat", c)} />;
  },
  stock: async (c) => {
    const [b, s] = await Promise.all([ledgerBalances(c.orgId), booksState(c.orgId)]);
    return <Tile label="Stock value" value={s.on ? money(b.stock) : "-"} hint={s.on ? "What Inventory holds in the ledger" : NO_LEDGER} href="/accounts/reports?r=bs" />;
  },
  advances: async (c) => {
    const [b, s] = await Promise.all([ledgerBalances(c.orgId), booksState(c.orgId)]);
    return <Tile label="Advances held for customers" value={s.on ? money(b.customerAdvances) : "-"} hint={s.on ? `${money(b.supplierAdvances)} paid to suppliers` : NO_LEDGER} href="/accounts/customers" />;
  },

  "sales-trend": async () => {
    const y = lastYear();
    const data = await salesByMonth(y.from, y.to);
    return <TrendPanel title="Sales by month" hint="Before VAT, less credit notes, last 12 months" format="aed" series={[{ key: "sales", label: "Sales", color: "var(--series-1)" }]} points={y.months.map((m) => ({ label: monthLabel(m), sales: round2(Number(data.find((d) => d.m === m)?.net ?? 0)) }))} />;
  },
  "profit-trend": async (c) => {
    const y = lastYear();
    const data = await ledgerByMonth(c.orgId, y.from, y.to);
    const at = (m: string) => data.find((d) => d.m === m);
    return (
      <TrendPanel
        title="Income and costs by month"
        hint="From the ledger, last 12 months"
        format="aed"
        series={[
          { key: "income", label: "Income", color: "var(--series-1)" },
          { key: "costs", label: "Costs", color: "var(--series-2)" },
        ]}
        points={y.months.map((m) => ({ label: monthLabel(m), income: round2(Number(at(m)?.income ?? 0)), costs: round2(Number(at(m)?.costs ?? 0)) }))}
      />
    );
  },
  "cash-trend": async () => {
    const y = lastYear();
    const data = await moneyByMonth(y.from, y.to);
    const at = (m: string) => data.find((d) => d.m === m);
    return (
      <TrendPanel
        title="Money in and out by month"
        hint="Receipts and vouchers, last 12 months"
        format="aed"
        series={[
          { key: "in", label: "In", color: "var(--series-1)" },
          { key: "out", label: "Out", color: "var(--series-2)" },
        ]}
        points={y.months.map((m) => ({ label: monthLabel(m), in: round2(Number(at(m)?.inn ?? 0)), out: round2(Number(at(m)?.out ?? 0)) }))}
      />
    );
  },
  "ar-ageing": async () => {
    const r = await cachedReceivables();
    return (
      <HBarPanel
        title="How late customers are"
        hint="What customers owe, by days past due"
        color="var(--series-2)"
        views={[
          { key: "amount", label: "Amount", format: "aed", unit: "AED owed", empty: "Nothing owed.", data: r.buckets.map((b) => ({ label: b.label, value: b.amount, note: plural(b.count, "invoice") })) },
          { key: "count", label: "Invoices", format: "count", unit: "invoices", empty: "Nothing owed.", data: r.buckets.map((b) => ({ label: b.label, value: b.count })) },
        ]}
      />
    );
  },
  "ap-ageing": async () => {
    const p = await cachedPayables();
    return (
      <HBarPanel
        title="How late we are"
        hint="What we owe suppliers, by days past due"
        color="var(--series-2)"
        views={[
          { key: "amount", label: "Amount", format: "aed", unit: "AED to pay", empty: "Nothing to pay.", data: p.buckets.map((b) => ({ label: b.label, value: b.amount, note: plural(b.count, "bill") })) },
          { key: "count", label: "Bills", format: "count", unit: "bills", empty: "Nothing to pay.", data: p.buckets.map((b) => ({ label: b.label, value: b.count })) },
        ]}
      />
    );
  },
  "cost-breakdown": async (c) => {
    const data = await costsByCategory(c.period.from, c.period.to);
    return <HBarPanel title="Where the money went" hint={`Running costs before VAT, ${c.period.label.toLowerCase()}`} color="var(--series-5)" views={[{ key: "amount", label: "Amount", format: "aed", unit: "AED", empty: "No running costs in this period.", data: data.map((d) => ({ label: categoryLabel(d.category), value: Number(d.net) })) }]} />;
  },
  "top-customers": async (c) => {
    const data = await topCustomers(c.period.from, c.period.to);
    return <HBarPanel title="Top customers" hint={`Sales before VAT, ${c.period.label.toLowerCase()}`} views={[{ key: "amount", label: "Amount", format: "aed", unit: "AED", empty: "No sales in this period.", data: data.map((d) => ({ label: d.name, value: Number(d.net), note: plural(Number(d.n), "invoice") })) }]} />;
  },
  "top-suppliers": async (c) => {
    const data = await topSuppliers(c.period.from, c.period.to);
    return <HBarPanel title="Top suppliers" hint={`Purchases before VAT, ${c.period.label.toLowerCase()}`} color="var(--series-3)" views={[{ key: "amount", label: "Amount", format: "aed", unit: "AED", empty: "No purchases in this period.", data: data.map((d) => ({ label: d.name, value: Number(d.net), note: plural(Number(d.n), "document") })) }]} />;
  },

  "overdue-list": async () => {
    const r = await cachedReceivables();
    const all = r.open.filter((i) => i.state.key === "overdue");
    return (
      <ListCard title="Overdue invoices" hint="The most overdue first" href="/accounts/invoices?view=overdue" count={all.length} empty="Nothing overdue.">
        {all.slice(0, 7).map((i) => (
          <Row key={i.id} href={`/accounts/invoices/${i.id}`} title={i.customerName} sub={`${i.number} · ${i.state.daysOverdue} day${i.state.daysOverdue === 1 ? "" : "s"} late`} right={money(i.state.balance)} />
        ))}
      </ListCard>
    );
  },
  "bills-list": async () => {
    const p = await cachedPayables();
    return (
      <ListCard title="Bills to pay" hint="The most urgent first" href="/accounts/bills" count={p.open.length} empty="Nothing to pay.">
        {p.open.slice(0, 7).map((b) => (
          <Row key={b.id} href={`/accounts/bills/${b.id}`} title={b.payee} sub={`${b.number} · due ${longDay(b.dueDate)}`} badge={<InvoiceStateBadge state={b.state} />} right={money(b.state.balance)} />
        ))}
      </ListCard>
    );
  },
  "to-invoice": async (c) => {
    const orders = (await listOrders(financeViewerOf(c.access))).filter((o) => o.status === "delivered");
    return (
      <ListCard title="Ready to invoice" hint="Delivered sales orders" href="/accounts/to-invoice" count={orders.length} empty="Nothing waiting for an invoice.">
        {orders.slice(0, 7).map((o) => (
          <Row key={o.id} href={`/accounts/orders/${o.id}`} title={o.companyName} sub={`${o.number}${o.deliveredOn ? ` · delivered ${longDay(o.deliveredOn)}` : ""}`} right={money(o.total)} />
        ))}
      </ListCard>
    );
  },
  "quotes-waiting": async (c) => {
    const quotes = (await listQuotes(financeViewerOf(c.access))).filter((q) => q.shownStatus === "sent");
    return (
      <ListCard title="Quotes waiting" hint="Sent, and waiting for an answer" href="/accounts/quotes?status=sent" count={quotes.length} empty="No quotes waiting.">
        {quotes.slice(0, 7).map((q) => (
          <Row key={q.id} href={`/accounts/quotes/${q.id}`} title={q.companyName} sub={`${q.number} · valid until ${longDay(q.validUntil)}`} badge={<QuoteStatusBadge status={q.shownStatus} />} right={money(q.total)} />
        ))}
      </ListCard>
    );
  },
  "no-cost": async (c) => {
    const list = await soldWithoutCost(c.period.from, c.period.to);
    return (
      <ListCard title="Sold without a cost" hint={`Profit looks too high until the bill arrives, ${c.period.label.toLowerCase()}`} href={reportHref("uninvoiced", c)} empty="Every sale in this period has a cost.">
        {list.map((r) => (
          <Row key={r.id} href={`/accounts/invoices/${r.id}`} title={r.name} sub={`${r.number} · ${longDay(r.date)}`} right={money(Number(r.net))} />
        ))}
      </ListCard>
    );
  },
  "recent-receipts": async () => {
    const list = await listPayments({ limit: 7 });
    return (
      <ListCard title="Latest money in" hint="The newest receipts" href="/accounts/payments" empty="No receipts yet.">
        {list.map((p) => (
          <Row key={p.id} href={`/print/receipt/${p.id}`} external title={<span className={p.voidedAt ? "text-muted-foreground line-through" : ""}>{p.customerName}</span>} sub={`${p.number} · ${longDay(p.paidOn)}${p.voidedAt ? " · voided" : ""}`} right={money(p.amount)} />
        ))}
      </ListCard>
    );
  },
  "recent-vouchers": async () => {
    const list = await listSupplierPayments({ limit: 7 });
    return (
      <ListCard title="Latest money out" hint="The newest payment vouchers" href="/accounts/payments-made" empty="No vouchers yet.">
        {list.map((p) => (
          <Row key={p.id} href={`/print/payment-voucher/${p.id}`} external title={<span className={p.voidedAt ? "text-muted-foreground line-through" : ""}>{p.payee}</span>} sub={`${p.number} · ${longDay(p.paidOn)}${p.voidedAt ? " · voided" : ""}`} right={money(p.amount)} />
        ))}
      </ListCard>
    );
  },

  shortcuts: async () => {
    const links = [
      { href: "/accounts/invoices/new", label: "New invoice", icon: ReceiptText },
      { href: "/accounts/quotes/new", label: "New quote", icon: FilePlus2 },
      { href: "/accounts/payments/new", label: "New receipt", icon: Wallet },
      { href: "/accounts/bills/new", label: "New bill", icon: ReceiptText },
      { href: "/accounts/expenses?new=1", label: "New expense", icon: HandCoins },
      { href: "/accounts/payments-made/new", label: "New voucher", icon: Wallet },
      { href: "/accounts/customers?new=1", label: "New customer", icon: Building2 },
      { href: "/accounts/suppliers?new=1", label: "New supplier", icon: Truck },
    ];
    return (
      <section className="h-full rounded-xl border bg-card p-3">
        <h2 className="mb-2 px-1 text-sm font-medium">Shortcuts</h2>
        <div className="grid grid-cols-2 gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
              <l.icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{l.label}</span>
            </Link>
          ))}
        </div>
      </section>
    );
  },
  "books-health": async (c) => {
    const [{ start, checks }, s] = await Promise.all([ledgerChecks(c.orgId), booksState(c.orgId)]);
    const off = checks.filter((x) => Math.abs(x.difference) >= 0.005);
    return (
      <section className="h-full rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          {!start || off.length ? <TriangleAlert className="size-4 text-amber-600" /> : <ShieldCheck className="size-4 text-emerald-600" />}
          Books check
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {!start ? "The ledger is not switched on yet." : off.length ? `${plural(off.length, "figure")} of the ledger ${off.length === 1 ? "differs" : "differ"} from the documents.` : "The ledger agrees with the documents."}
          {" "}
          {s.lockDate ? `Locked up to ${longDay(s.lockDate)}.` : "No lock date set."}
        </p>
        {checks.length > 0 && (
          <ul className="mt-2 divide-y text-xs">
            {checks.map((x) => (
              <li key={x.label} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0 truncate" title={x.hint}>
                  {x.label}
                </span>
                <span className="shrink-0 tabular-nums">{Math.abs(x.difference) >= 0.005 ? `Differs by ${money(x.difference)}` : money(x.ledger)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/accounts/settings/opening" className="mt-2 inline-block text-xs font-medium hover:underline">
          Open the checks
        </Link>
      </section>
    );
  },
};


/** One widget, ready to show. A widget that fails says so on its own card and leaves the rest of the overview alone. */
export async function Widget({ id, context }: { id: string; context: WidgetContext }) {
  try {
    const render = WIDGETS[id];
    if (!render) return null;
    return await render(context);
  } catch (e) {
    console.error(`[overview] widget ${id} failed:`, e);
    return (
      <div className="flex h-full min-h-20 items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <TriangleAlert className="size-4 shrink-0 text-amber-600" /> {widgetDef(id)?.title ?? "This widget"} could not load. Refresh to try again.
      </div>
    );
  }
}

/** The shape a widget takes while its figures load, so the page does not jump. */
export function WidgetSkeleton({ id }: { id: string }) {
  const tile = widgetDef(id)?.group === "Key figures";
  return <div className={`animate-pulse rounded-xl border bg-card ${tile ? "h-20" : "h-72"}`} aria-hidden />;
}
