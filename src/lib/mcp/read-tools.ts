import "server-only";
import { z } from "zod";
import { accountsBadges, companyBalance, listInvoices, openInvoices, receivables } from "@/lib/accounts-data";
import { dubaiToday } from "@/lib/dates";
import { listOrders } from "@/lib/orders-data";
import { procurementOverview } from "@/lib/procurement-overview";
import { stockStatus } from "@/lib/procurement/intake";
import { payables, supplierBalances } from "@/lib/purchases-data";
import { dealItemsOf, listQuotes, quotesOfDeal } from "@/lib/quotes-data";
import { parseReportParams } from "@/lib/report-centre";
import { runCentreReport } from "@/lib/report-run";
import { dealActivities, dealStageStats, dealTasks, getCompany, getDeal, listDeals, salesPeople, salesPulse, searchCompanies } from "@/lib/sales-data";
import { STAGES } from "@/lib/sales";
import { searchOffers } from "@/lib/search";
import { listTasks } from "@/lib/tasks";
import { teamOpen } from "@/lib/notifications/digest";
import { webOrderCounts, webOrdersSnapshot } from "@/lib/website/web-orders-snapshot";
import { ORDER_STATUSES } from "@/lib/website/store-core";
import { UserError } from "@/lib/user-error";
import type { AppKey } from "@/lib/apps";
import { app, defineTool, finance, type McpCtx, type McpTool } from "./tool";

/** Links back into the portal, so Claude can hand the user something to click. */
export const link = {
  deal: (c: McpCtx, id: number) => `${c.base}/crm/deals/${id}`,
  customer: (c: McpCtx, id: number) => `${c.base}/sales/customers/${id}`,
  quote: (c: McpCtx, id: number) => `${c.base}/sales/quotes/${id}`,
  order: (c: McpCtx, id: number) => `${c.base}/sales/orders/${id}`,
  invoice: (c: McpCtx, id: number) => `${c.base}/accounts/invoices/${id}`,
  bill: (c: McpCtx, id: number) => `${c.base}/accounts/bills/${id}`,
};

const limit = (dflt = 25) => z.number().int().min(1).max(100).default(dflt).describe(`How many rows at most (default ${dflt}, max 100)`);
const STAGE_KEYS = STAGES.map((s) => s.key) as [string, ...string[]];
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400_000);

const dealLine = (c: McpCtx, d: Awaited<ReturnType<typeof listDeals>>[number]) => ({
  id: d.id,
  title: d.title,
  customer: d.companyName,
  customerId: d.companyId,
  contact: d.contactName || undefined,
  stage: d.stage,
  valueAed: d.valueAed,
  owner: d.ownerName || undefined,
  team: d.assignees.map((a) => a.name),
  expectedClose: d.expectedClose,
  nextTaskDue: d.nextDue,
  lastActivity: d.lastActivityAt?.toISOString().slice(0, 10) ?? null,
  temperature: d.temp,
  link: link.deal(c, d.id),
});

const invoiceLine = (c: McpCtx, i: Awaited<ReturnType<typeof listInvoices>>[number]) => ({
  id: i.id,
  number: i.number,
  customer: i.customerName,
  customerId: i.companyId,
  issued: i.issueDate,
  due: i.dueDate,
  totalAed: i.total,
  balanceAed: i.state.balance,
  state: i.state.key,
  daysOverdue: i.state.daysOverdue > 0 ? i.state.daysOverdue : 0,
  salesperson: i.ownerName,
  link: link.invoice(c, i.id),
});

const businessOverview = defineTool({
  name: "business_overview",
  title: "Business overview",
  description:
    "Start here. Today's picture of the business as this person sees it in the portal: open pipeline by stage, deals that went quiet, overdue tasks; for admins also the team's open high/critical alerts; with the Accounts app also money customers owe (ageing), bills due and this month's collections; with the Website app the web shop's orders. Use it to suggest what to do today.",
  input: z.object({}),
  async run(_a, c) {
    const today = dubaiToday();
    const { auth } = c;
    const admin = auth.role === "admin";
    const none = Promise.resolve(null);
    const [pulse, tasks, alerts, owed, due, badges, web] = await Promise.all([
      salesPulse(auth.userId, auth.seesAll),
      // admins see everyone's tasks (like the Tasks page); everybody else their own
      listTasks({ userId: admin ? undefined : auth.userId }),
      admin ? teamOpen() : none,
      auth.finance ? receivables() : none,
      auth.finance ? payables() : none,
      auth.finance ? accountsBadges() : none,
      auth.apps.includes("website") ? webOrderCounts() : none,
    ]);
    const overdueTasks = tasks.open.filter((t) => t.dueDate && t.dueDate < today);
    return {
      today,
      seenAs: { name: auth.name, scope: auth.seesAll ? "all records" : "only the deals this person is on" },
      pipeline: {
        openDeals: pulse.openCount,
        openValueAed: pulse.openValue,
        newThisWeek: pulse.newThisWeek,
        wonThisWeek: { count: pulse.wonCount, valueAed: pulse.wonValue },
        byStage: pulse.stages,
        quiet: pulse.attention.map((a) => ({ ...a, link: link.deal(c, a.id) })),
      },
      tasks: {
        open: tasks.open.length,
        dueToday: tasks.open.filter((t) => t.dueDate === today).length,
        overdue: overdueTasks.length,
        oldestOverdue: overdueTasks.slice(0, 10).map((t) => ({ id: t.id, title: t.title, due: t.dueDate, person: t.assigneeName, about: t.relatedTitle })),
      },
      alerts: alerts && {
        open: alerts.length,
        critical: alerts.filter((a) => a.priority === "critical").length,
        byPerson: Object.entries(
          alerts.reduce<Record<string, number>>((m, a) => {
            m[a.userName] = (m[a.userName] ?? 0) + 1;
            return m;
          }, {}),
        ).map(([person, count]) => ({ person, count })),
        top: alerts
          .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "critical" ? -1 : 1))
          .slice(0, 15)
          .map((a) => ({ priority: a.priority, title: a.title, person: a.userName, since: a.createdAt.toISOString().slice(0, 10), link: a.link ? `${c.base}${a.link}` : undefined })),
      },
      customersOwe: owed && {
        totalAed: owed.owed,
        overdueAed: owed.overdue,
        dueNext7DaysAed: owed.dueSoon,
        collectedThisMonthAed: owed.collectedThisMonth,
        ageing: owed.buckets,
        mostOverdue: owed.open.filter((i) => i.state.daysOverdue > 0).slice(0, 10).map((i) => invoiceLine(c, i)),
      },
      weOweSuppliers: due && {
        totalAed: due.owed,
        overdueAed: due.overdue,
        dueNext7DaysAed: due.dueSoon,
        paidThisMonthAed: due.paidThisMonth,
        nextDue: due.open.slice(0, 5).map((b) => ({ id: b.id, number: b.number, supplier: b.payee, due: b.dueDate, balanceAed: b.state.balance, link: link.bill(c, b.id) })),
      },
      accountsToDo: badges,
      webShopOrders: web,
    };
  },
});

const find = defineTool({
  name: "find",
  title: "Find a record",
  description: "Look up customers, deals, quotes and invoices (invoices with the Accounts app only) by name, title or number (e.g. 'Emirates Steel', 'ZQ-00123', 'INV-00456'). Returns ids and links for the other tools.",
  needs: app("crm", "sales", "projects"),
  input: z.object({ query: z.string().trim().min(2).max(100).describe("A name, deal title, or quote/invoice/order number") }),
  async run({ query }, c) {
    const q = query.toLowerCase();
    const has = (k: AppKey) => c.auth.apps.includes(k);
    const [customers, deals, quotes, invoices] = await Promise.all([
      searchCompanies(c.viewer, query, 8),
      has("crm") || has("projects") ? listDeals(c.viewer, { q: query, limit: 10 }) : [],
      has("sales") || has("projects") ? listQuotes(c.viewer, 500) : [],
      // the invoice list is not split by salesperson: Accounts only, as in the portal
      c.auth.finance ? listInvoices() : [],
    ]);
    return {
      customers: customers.map((x) => ({ ...x, link: link.customer(c, x.id) })),
      deals: deals.map((d) => dealLine(c, d)),
      quotes: quotes
        .filter((x) => x.number.toLowerCase().includes(q) || x.companyName.toLowerCase().includes(q) || x.dealTitle.toLowerCase().includes(q))
        .slice(0, 10)
        .map((x) => ({ id: x.id, number: x.number, customer: x.companyName, deal: x.dealTitle || undefined, status: x.shownStatus, totalAed: x.total, link: link.quote(c, x.id) })),
      invoices: invoices
        .filter((x) => x.number.toLowerCase().includes(q) || x.customerName.toLowerCase().includes(q))
        .slice(0, 10)
        .map((x) => invoiceLine(c, x)),
    };
  },
});

const listDealsTool = defineTool({
  name: "list_deals",
  title: "List deals",
  description: "Deals in the CRM pipeline, newest stage change first. Filter by stage, salesperson or text; 'quiet_days' keeps only deals with no activity for that many days.",
  needs: app("crm", "projects"),
  input: z.object({
    stage: z.enum(STAGE_KEYS).optional().describe("new, contacted, requirement (qualified), sourcing (pricing), quoted, negotiation, won, lost"),
    open_only: z.boolean().default(true).describe("Leave out won and lost deals (ignored when stage is given)"),
    salesperson_id: z.number().int().optional().describe("Only deals this user is on (ids from the team tool)"),
    query: z.string().max(100).optional(),
    quiet_days: z.number().int().min(1).max(365).optional(),
    limit: limit(),
  }),
  async run(a, c) {
    const stages = a.stage ? [a.stage as (typeof STAGES)[number]["key"]] : a.open_only ? STAGES.filter((s) => s.key !== "won" && s.key !== "lost").map((s) => s.key) : undefined;
    let rows = await listDeals(c.viewer, { stages, memberId: a.salesperson_id, q: a.query, limit: a.quiet_days ? 500 : a.limit });
    if (a.quiet_days) {
      const before = Date.now() - a.quiet_days * 86400_000;
      rows = rows.filter((d) => (d.lastActivityAt ?? d.createdAt).getTime() < before);
    }
    const stats = await dealStageStats(c.viewer, { memberId: a.salesperson_id });
    return { totalsByStage: stats, deals: rows.slice(0, a.limit).map((d) => dealLine(c, d)) };
  },
});

const getDealTool = defineTool({
  name: "get_deal",
  title: "Deal details",
  description: "One deal with its requirement, timeline (calls, notes, stage changes), open tasks, line items and quotes.",
  needs: app("crm", "projects"),
  input: z.object({ deal_id: z.number().int() }),
  async run({ deal_id }, c) {
    const d = await getDeal(deal_id, c.viewer);
    if (!d) throw new UserError(`There is no deal ${deal_id}.`);
    const [timeline, tasks, items, quotes] = await Promise.all([dealActivities(deal_id), dealTasks(deal_id), dealItemsOf(deal_id), quotesOfDeal(deal_id)]);
    return {
      ...dealLine(c, d),
      requirement: d.requirement,
      source: d.source,
      lostReason: d.lostReason || undefined,
      followUpAt: d.followUpAt,
      checks: d.checks,
      timeline: timeline.slice(0, 30).map((t) => ({ at: t.at.toISOString().slice(0, 16), type: t.type, by: t.userName, text: t.body })),
      tasks,
      items: items.map((i) => ({ description: i.description, qty: i.qty, unitPriceAed: i.unitPriceAed, costAed: i.costAed, supplier: i.supplierName })),
      quotes: quotes.map((q) => ({ id: q.id, number: q.number, status: q.shownStatus, totalAed: q.total, validUntil: q.validUntil, link: link.quote(c, q.id) })),
    };
  },
});

const getCustomer = defineTool({
  name: "get_customer",
  title: "Customer details",
  description: "One customer (company): details, contacts, deals, recent timeline, balance owed, and (with the Accounts app) the open invoices.",
  needs: app("crm", "sales"),
  input: z.object({ customer_id: z.number().int() }),
  async run({ customer_id }, c) {
    const co = await getCompany(customer_id, c.viewer);
    if (!co) throw new UserError(`There is no customer ${customer_id}.`);
    // as on the customer page: everyone who sees the customer sees the balance, the invoice list is for Accounts
    const [open, balance] = await Promise.all([c.auth.finance ? openInvoices(customer_id) : undefined, companyBalance(customer_id)]);
    return {
      id: co.id,
      name: co.name,
      industry: co.industry,
      emirate: co.emirate,
      phone: co.phone,
      website: co.website,
      trn: co.trn,
      owner: co.ownerName,
      link: link.customer(c, co.id),
      balance,
      openInvoices: open,
      contacts: co.contacts.map((p) => ({ id: p.id, name: p.name, jobTitle: p.jobTitle, email: p.email, phone: p.phone, whatsapp: p.whatsapp, decisionMaker: p.isDecisionMaker })),
      deals: co.deals.map((d) => dealLine(c, d)),
      timeline: co.activities.slice(0, 20).map((t) => ({ at: t.at.toISOString().slice(0, 16), type: t.type, by: t.userName, deal: t.dealTitle, text: t.body })),
    };
  },
});

const listQuotesTool = defineTool({
  name: "list_quotes",
  title: "List quotes",
  description: "Quotes, newest first, with status (draft, sent, accepted, expired...), customer and totals. Filter by status or text.",
  needs: app("sales", "projects"),
  input: z.object({ status: z.string().max(20).optional().describe("e.g. draft, sent, accepted, expired"), query: z.string().max(100).optional(), limit: limit() }),
  async run(a, c) {
    const q = a.query?.toLowerCase();
    const rows = (await listQuotes(c.viewer, 500))
      .filter((x) => !a.status || x.shownStatus === a.status || x.status === a.status)
      .filter((x) => !q || x.number.toLowerCase().includes(q) || x.companyName.toLowerCase().includes(q) || x.dealTitle.toLowerCase().includes(q));
    return {
      count: rows.length,
      quotes: rows.slice(0, a.limit).map((x) => ({
        id: x.id,
        number: x.number,
        customer: x.companyName,
        deal: x.dealTitle || undefined,
        dealId: x.dealId,
        status: x.shownStatus,
        validUntil: x.validUntil,
        totalAed: x.total,
        costAed: x.costTotal,
        salesperson: x.createdByName,
        link: link.quote(c, x.id),
      })),
    };
  },
});

const listOrdersTool = defineTool({
  name: "list_orders",
  title: "List sales orders",
  description: "Sales orders (confirmed sales, including web shop orders turned into sales orders), newest first, with delivery and invoice state.",
  needs: app("sales"),
  input: z.object({ status: z.string().max(20).optional(), customer_id: z.number().int().optional(), limit: limit() }),
  async run(a, c) {
    const rows = (await listOrders(c.viewer, { companyId: a.customer_id, limit: 500 })).filter((o) => !a.status || o.status === a.status);
    return {
      count: rows.length,
      orders: rows.slice(0, a.limit).map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        customer: o.companyName,
        deal: o.dealTitle || undefined,
        customerRef: o.customerRef || undefined,
        totalAed: o.total,
        deliveredOn: o.deliveredOn,
        invoice: o.invoice ? { number: o.invoice.number, state: o.invoice.state.key, balanceAed: o.invoice.state.balance } : null,
        created: o.createdAt.toISOString().slice(0, 10),
        link: link.order(c, o.id),
      })),
    };
  },
});

const webOrders = defineTool({
  name: "web_orders",
  title: "Web shop orders",
  description: "Orders placed on the zeronixtech.com shop, by status (new, confirmed, paid, shipped, delivered, cancelled), with counts per status.",
  needs: app("website"),
  input: z.object({ status: z.enum(ORDER_STATUSES).default("new"), limit: limit() }),
  async run(a, c) {
    const snap = await webOrdersSnapshot(a.status, a.limit);
    if (!snap) throw new UserError("The website database is not connected on this server.");
    return { counts: snap.counts, orders: snap.orders.map((o) => ({ ...o, link: `${c.base}/website/orders/${o.id}` })) };
  },
});

const moneyOwed = defineTool({
  name: "money_owed",
  title: "Money customers owe",
  description: "Unpaid customer invoices, most overdue first, with ageing totals. Use it for collection follow-ups.",
  needs: finance,
  input: z.object({ min_days_overdue: z.number().int().min(0).default(0), customer_id: z.number().int().optional(), limit: limit() }),
  async run(a, c) {
    const r = await receivables();
    const open = r.open.filter((i) => i.state.daysOverdue >= a.min_days_overdue && (!a.customer_id || i.companyId === a.customer_id));
    const byCustomer = new Map<string, number>();
    for (const i of open) byCustomer.set(i.customerName, (byCustomer.get(i.customerName) ?? 0) + i.state.balance);
    return {
      totalAed: r.owed,
      overdueAed: r.overdue,
      dueNext7DaysAed: r.dueSoon,
      collectedThisMonthAed: r.collectedThisMonth,
      ageing: r.buckets,
      biggestDebtors: [...byCustomer].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([customer, aed]) => ({ customer, owesAed: Math.round(aed * 100) / 100 })),
      invoices: open.slice(0, a.limit).map((i) => invoiceLine(c, i)),
    };
  },
});

const billsDue = defineTool({
  name: "bills_due",
  title: "Bills we owe",
  description: "Unpaid supplier bills, most overdue first, ageing totals, and balances per supplier.",
  needs: finance,
  input: z.object({ limit: limit() }),
  async run(a, c) {
    const [p, suppliers] = await Promise.all([payables(), supplierBalances()]);
    return {
      totalAed: p.owed,
      overdueAed: p.overdue,
      dueNext7DaysAed: p.dueSoon,
      paidThisMonthAed: p.paidThisMonth,
      ageing: p.buckets,
      suppliers: suppliers.filter((s) => s.owed > 0).slice(0, 15).map((s) => ({ name: s.name, owedAed: s.owed, overdueAed: s.overdue, lastPaid: s.lastPaid })),
      bills: p.open.slice(0, a.limit).map((b) => ({
        id: b.id,
        number: b.number,
        supplier: b.payee,
        issued: b.billDate,
        due: b.dueDate,
        balanceAed: b.state.balance,
        daysOverdue: b.state.daysOverdue > 0 ? b.state.daysOverdue : 0,
        link: link.bill(c, b.id),
      })),
    };
  },
});

const REPORTS = ["pl", "bs", "cf", "tb", "aged-ar", "aged-ap", "sales", "purchases", "vat-return", "vat", "cash", "profit", "project-profit", "expenses", "uninvoiced", "pnl"] as const;
const PERIODS = ["this-month", "last-month", "this-quarter", "last-quarter", "this-year", "last-year"] as const;

const runReport = defineTool({
  name: "run_report",
  title: "Run a report",
  description:
    "Accounts reports: pl (profit and loss), bs (balance sheet), cf (cash flow), tb (trial balance), aged-ar / aged-ap (ageing), sales, purchases, vat-return (VAT 201), vat, cash, profit (per sale), project-profit, expenses, uninvoiced, pnl (quick profit from documents, works before the ledger is switched on). Pick a period or give from/to dates.",
  needs: finance,
  input: z.object({
    report: z.enum(REPORTS),
    period: z.enum(PERIODS).default("this-month"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD, with 'to', instead of a period"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; for bs and ageing reports, the 'as of' day"),
  }),
  async run(a) {
    const vals: Record<string, string | undefined> = { r: a.report, period: a.period, from: a.from, to: a.to };
    const params = parseReportParams((k) => vals[k], dubaiToday());
    const rep = await runCentreReport(params);
    return {
      title: rep.title,
      period: rep.period,
      notice: rep.notice,
      kpis: rep.kpis,
      tables: rep.tables.map((t) => ({
        title: t.title,
        columns: t.columns.map((col) => (typeof col === "string" ? col : (col as { label?: string }).label ?? "")),
        rows: t.rows.slice(0, 80),
        truncated: t.rows.length > 80 ? t.rows.length : undefined,
        total: t.total,
      })),
    };
  },
});

const listTasksTool = defineTool({
  name: "list_tasks",
  title: "List tasks",
  description: "Open tasks and follow-ups, soonest due first, plus how many are overdue. Admins see everyone's (or one person's with person_id); everybody else sees their own.",
  needs: app("tasks"),
  input: z.object({ person_id: z.number().int().optional().describe("Admins only: user id from the team tool"), overdue_only: z.boolean().default(false), limit: limit(50) }),
  async run(a, c) {
    const today = dubaiToday();
    const { open } = await listTasks({ userId: c.auth.role === "admin" ? a.person_id : c.auth.userId });
    const rows = a.overdue_only ? open.filter((t) => t.dueDate && t.dueDate < today) : open;
    return {
      open: open.length,
      overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
      tasks: rows.slice(0, a.limit).map((t) => ({
        id: t.id,
        title: t.title,
        notes: t.notes || undefined,
        due: t.dueDate,
        daysOverdue: t.dueDate && t.dueDate < today ? daysBetween(t.dueDate, today) : undefined,
        priority: t.priority,
        person: t.assigneeName,
        about: t.relatedTitle ?? undefined,
        dealLink: t.relatedType === "deal" && t.relatedId ? link.deal(c, t.relatedId) : undefined,
      })),
    };
  },
});

const products = defineTool({
  name: "products_and_prices",
  title: "Products, supplier prices and stock notes",
  description:
    "Search supplier price lists (procurement) for a product: best price in AED, which suppliers offer it, stock notes and how fresh the prices are. Without a query, returns the procurement overview (suppliers, price lists, recent changes).",
  // the quote builder's "Find price" searches the same price lists, so Sales and Projects get it too
  needs: app("procurement", "sales", "projects"),
  input: z.object({ query: z.string().max(100).optional().describe("Brand, model or part number, e.g. 'Dell Latitude 5450' or 'i7 16GB'"), in_stock_only: z.boolean().default(false), limit: limit(15) }),
  async run(a, c) {
    if (!a.query?.trim()) {
      if (!c.auth.apps.includes("procurement")) throw new UserError("Give a product to search for (brand, model or part number).");
      return { overview: await procurementOverview() };
    }
    const r = await searchOffers({ q: a.query, readyOnly: a.in_stock_only, latestOnly: true, limit: a.limit });
    return {
      total: r.total,
      fuzzyMatch: r.fuzzy || undefined,
      products: r.products.map((p) => ({
        product: p.label,
        category: p.category,
        specs: p.specSummary,
        bestPrice: p.bestPrice,
        bestCurrency: p.bestCurrency,
        latestPrice: p.latestAt.slice(0, 10),
        offers: p.offers.slice(0, 6).map((o) => ({ supplier: o.supplierName, price: o.price, currency: o.currency, priceAed: o.priceAed, stock: o.stockNote, condition: o.condition, received: o.receivedAt.slice(0, 10), stale: o.stale })),
      })),
    };
  },
});

const team = defineTool({
  name: "team",
  title: "Team members",
  description: "Active people who work in Sales or Accounts, with their user ids (for assigning tasks or filtering deals and tasks).",
  input: z.object({}),
  async run() {
    return { people: await salesPeople() };
  },
});

const stockStatusTool = defineTool({
  name: "supplier_stock_status",
  title: "When supplier chats were last pushed",
  description:
    "Before reading WhatsApp for push_supplier_stock: when each supplier chat or group was last pushed (lastMessageAt, so read only newer messages), what waits in the Procurement Inbox, and the suppliers we know with their WhatsApp numbers and names.",
  needs: app("procurement"),
  input: z.object({ chat: z.string().max(120).optional().describe("One WhatsApp group or chat name; leave out for all") }),
  async run(a, c) {
    return { ...(await stockStatus(a.chat)), inbox: `${c.base}/procurement/inbox` };
  },
});

export const readTools: McpTool[] = [businessOverview, find, listDealsTool, getDealTool, getCustomer, listQuotesTool, listOrdersTool, webOrders, moneyOwed, billsDue, runReport, listTasksTool, products, stockStatusTool, team];
