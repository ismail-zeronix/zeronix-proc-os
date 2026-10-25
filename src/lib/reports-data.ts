import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { receivables } from "@/lib/accounts-data";
import { methodLabel } from "@/lib/invoicing";
import { categoryLabel } from "@/lib/purchases";
import { payables } from "@/lib/purchases-data";
import { round2 } from "@/lib/quotation";
import { buildPnl, monthLabel, monthsBetween, pct, REPORTS, type Report, type ReportKey } from "@/lib/reports";

type Row = Record<string, unknown>;
const rows = async <T extends Row>(q: ReturnType<typeof sql>) => (await db.execute<T>(q)).rows;
const n = (v: unknown) => round2(Number(v ?? 0));

/** Invoiced (before VAT) per month, sales only (not opening balances); cancelled ones too, their credit notes take them back out. */
async function salesByMonth(from: string, to: string) {
  const [inv, cn] = await Promise.all([
    rows<{ m: string; s: number; v: number }>(sql`SELECT to_char(issue_date, 'YYYY-MM') m, sum(subtotal)::float s, sum(vat_amount)::float v FROM invoices
      WHERE kind = 'sale' AND issue_date BETWEEN ${from} AND ${to} GROUP BY 1`),
    rows<{ m: string; s: number; v: number }>(sql`SELECT to_char(c.issue_date, 'YYYY-MM') m, sum(c.subtotal)::float s, sum(c.vat_amount)::float v FROM credit_notes c
      JOIN invoices i ON i.id = c.invoice_id WHERE i.kind = 'sale' AND c.issue_date BETWEEN ${from} AND ${to} GROUP BY 1`),
  ]);
  return { inv: new Map(inv.map((r) => [r.m, r])), cn: new Map(cn.map((r) => [r.m, r])) };
}

/** Bills and expenses (before VAT) per month and category, voids and opening balances left out. */
async function costsByMonth(from: string, to: string) {
  return rows<{ m: string; category: string; s: number; v: number }>(sql`SELECT to_char(bill_date, 'YYYY-MM') m, category, sum(subtotal)::float s, sum(vat_amount)::float v FROM bills
    WHERE status <> 'void' AND kind <> 'opening' AND bill_date BETWEEN ${from} AND ${to} GROUP BY 1, 2`);
}

async function pnlReport(from: string, to: string, period: string): Promise<Report> {
  const [s, costs] = await Promise.all([salesByMonth(from, to), costsByMonth(from, to)]);
  const months = monthsBetween(from, to).map((m) => ({
    month: m,
    sales: n(s.inv.get(m)?.s),
    credits: n(s.cn.get(m)?.s),
    costs: Object.fromEntries(costs.filter((c) => c.m === m).map((c) => [c.category, n(c.s)])),
  }));
  const p = buildPnl({ months, categoryLabel });
  const t = p.totals;
  const lines: (string | number | null)[][] = [
    ["Sales (invoiced, before VAT)", t.sales, null],
    ["Less credit notes", t.credits ? -t.credits : 0, null],
    ["Net sales", t.net, 100],
    ["Cost of goods sold", t.cogs ? -t.cogs : 0, pct(t.cogs, t.net)],
    ["Gross profit", t.gross, pct(t.gross, t.net)],
    ...p.categories.map((c) => [c.label, -c.amount, pct(c.amount, t.net)] as (string | number | null)[]),
    ["Total expenses", t.exp ? -t.exp : 0, pct(t.exp, t.net)],
  ];
  return {
    title: "Profit and loss",
    period,
    kpis: [
      { label: "Net sales", value: t.net, kind: "money" },
      { label: "Gross profit", value: t.gross, kind: "money", hint: t.net ? `${pct(t.gross, t.net)}% of sales` : undefined },
      { label: "Expenses", value: t.exp, kind: "money" },
      { label: "Net profit", value: t.profit, kind: "money", hint: t.net ? `${pct(t.profit, t.net)}% of sales` : undefined },
    ],
    tables: [
      {
        title: "Profit and loss",
        columns: [{ label: "" }, { label: "AED", kind: "money" }, { label: "% of sales", kind: "pct" }],
        rows: lines,
        strong: [2, 4, 6 + p.categories.length],
        total: ["Net profit", t.profit, pct(t.profit, t.net)],
        note: "Sales by invoice date, costs by bill date, before VAT. Opening balances carried from Zoho are not included.",
      },
      ...(p.byMonth.length > 1
        ? [
            {
              title: "Month by month",
              columns: [{ label: "Month" }, { label: "Net sales", kind: "money" as const }, { label: "Cost of goods", kind: "money" as const }, { label: "Gross profit", kind: "money" as const }, { label: "Expenses", kind: "money" as const }, { label: "Net profit", kind: "money" as const }],
              rows: p.byMonth.map((m) => [monthLabel(m.month), m.net, m.cogs, m.gross, m.exp, m.profit]),
              total: ["Total", t.net, t.cogs, t.gross, t.exp, t.profit],
            },
          ]
        : []),
    ],
  };
}

async function vatReport(from: string, to: string, period: string): Promise<Report> {
  const [inv, cn, bills] = await Promise.all([
    rows<{ number: string; issue_date: string; customer_name: string; customer_trn: string; subtotal: number; vat_amount: number }>(sql`SELECT number, issue_date::text, customer_name, customer_trn, subtotal::float, vat_amount::float FROM invoices
      WHERE kind = 'sale' AND issue_date BETWEEN ${from} AND ${to} ORDER BY issue_date, number`),
    rows<{ number: string; issue_date: string; invoice: string; customer_name: string; subtotal: number; vat_amount: number }>(sql`SELECT c.number, c.issue_date::text, i.number invoice, i.customer_name, c.subtotal::float, c.vat_amount::float FROM credit_notes c
      JOIN invoices i ON i.id = c.invoice_id WHERE i.kind = 'sale' AND c.issue_date BETWEEN ${from} AND ${to} ORDER BY c.issue_date, c.number`),
    rows<{ number: string; bill_date: string; payee: string; trn: string; supplier_ref: string; category: string; subtotal: number; vat_amount: number }>(sql`SELECT b.number, b.bill_date::text, coalesce(s.name, b.paid_to) payee, coalesce(s.trn, '') trn, b.supplier_ref, b.category, b.subtotal::float, b.vat_amount::float
      FROM bills b LEFT JOIN suppliers s ON s.id = b.supplier_id WHERE b.status <> 'void' AND b.kind <> 'opening' AND b.bill_date BETWEEN ${from} AND ${to} ORDER BY b.bill_date, b.number`),
  ]);
  const sum = (a: { subtotal: number; vat_amount: number }[], k: "subtotal" | "vat_amount") => round2(a.reduce((s, r) => s + n(r[k]), 0));
  const outNet = round2(sum(inv, "subtotal") - sum(cn, "subtotal"));
  const outVat = round2(sum(inv, "vat_amount") - sum(cn, "vat_amount"));
  const taxed = bills.filter((b) => n(b.vat_amount) > 0);
  const inNet = sum(taxed, "subtotal");
  const inVat = sum(taxed, "vat_amount");
  const payable = round2(outVat - inVat);
  return {
    title: "VAT summary",
    period,
    kpis: [
      { label: "VAT on sales", value: outVat, kind: "money" },
      { label: "VAT on purchases", value: inVat, kind: "money", hint: "recoverable, with a tax invoice" },
      { label: payable >= 0 ? "VAT to pay" : "VAT to reclaim", value: Math.abs(payable), kind: "money" },
    ],
    tables: [
      {
        title: "Summary",
        columns: [{ label: "" }, { label: "Amount before VAT", kind: "money" }, { label: "VAT", kind: "money" }],
        rows: [
          ["Standard-rated sales (5%), after credit notes", outNet, outVat],
          ["Purchases and expenses with VAT", inNet, inVat],
        ],
        total: [payable >= 0 ? "Net VAT to pay" : "Net VAT to reclaim", null, Math.abs(payable)],
        note: "Check with your accountant before filing: zero-rated, exempt and reverse-charge items are not separated here. Opening balances are not included.",
      },
      {
        title: "Sales invoices",
        columns: [{ label: "Invoice" }, { label: "Date" }, { label: "Customer" }, { label: "Customer TRN" }, { label: "Before VAT", kind: "money" }, { label: "VAT", kind: "money" }],
        rows: inv.map((r) => [r.number, r.issue_date, r.customer_name, r.customer_trn, n(r.subtotal), n(r.vat_amount)]),
        total: ["Total", null, null, null, sum(inv, "subtotal"), sum(inv, "vat_amount")],
      },
      ...(cn.length
        ? [
            {
              title: "Credit notes",
              columns: [{ label: "Credit note" }, { label: "Date" }, { label: "Invoice" }, { label: "Customer" }, { label: "Before VAT", kind: "money" as const }, { label: "VAT", kind: "money" as const }],
              rows: cn.map((r) => [r.number, r.issue_date, r.invoice, r.customer_name, n(r.subtotal), n(r.vat_amount)]),
              total: ["Total", null, null, null, sum(cn, "subtotal"), sum(cn, "vat_amount")],
            },
          ]
        : []),
      {
        title: "Bills and expenses",
        columns: [{ label: "Bill" }, { label: "Date" }, { label: "Supplier" }, { label: "Supplier TRN" }, { label: "Their no." }, { label: "Category" }, { label: "Before VAT", kind: "money" }, { label: "VAT", kind: "money" }],
        rows: bills.map((r) => [r.number, r.bill_date, r.payee, r.trn, r.supplier_ref, categoryLabel(r.category), n(r.subtotal), n(r.vat_amount)]),
        total: ["Total", null, null, null, null, null, sum(bills, "subtotal"), sum(bills, "vat_amount")],
      },
    ],
  };
}

async function receivablesReport(period: string): Promise<Report> {
  const r = await receivables();
  return {
    title: "Customers owe",
    period,
    kpis: [
      { label: "Customers owe", value: r.owed, kind: "money" },
      { label: "Overdue", value: r.overdue, kind: "money" },
      { label: "Due in 7 days", value: r.dueSoon, kind: "money" },
      { label: "Collected this month", value: r.collectedThisMonth, kind: "money" },
    ],
    tables: [
      { title: "By how late", columns: [{ label: "" }, { label: "Invoices", kind: "int" }, { label: "AED", kind: "money" }], rows: r.buckets.map((b) => [b.label, b.count, b.amount]), total: ["Total", r.open.length, r.owed] },
      {
        title: "Unpaid invoices",
        columns: [{ label: "Invoice" }, { label: "Customer" }, { label: "Date" }, { label: "Due" }, { label: "Days late", kind: "int" }, { label: "Total", kind: "money" }, { label: "Still owed", kind: "money" }],
        rows: r.open.map((i) => [i.number, i.customerName, i.issueDate, i.dueDate, i.state.daysOverdue || null, i.total, i.state.balance]),
        total: ["Total", null, null, null, null, null, r.owed],
      },
    ],
  };
}

async function payablesReport(period: string): Promise<Report> {
  const p = await payables();
  return {
    title: "We owe suppliers",
    period,
    kpis: [
      { label: "We owe", value: p.owed, kind: "money" },
      { label: "Overdue", value: p.overdue, kind: "money" },
      { label: "Due in 7 days", value: p.dueSoon, kind: "money" },
      { label: "Paid this month", value: p.paidThisMonth, kind: "money" },
    ],
    tables: [
      { title: "By how late", columns: [{ label: "" }, { label: "Bills", kind: "int" }, { label: "AED", kind: "money" }], rows: p.buckets.map((b) => [b.label, b.count, b.amount]), total: ["Total", p.open.length, p.owed] },
      {
        title: "Unpaid bills",
        columns: [{ label: "Bill" }, { label: "Supplier" }, { label: "Their no." }, { label: "Due" }, { label: "Days late", kind: "int" }, { label: "Total", kind: "money" }, { label: "Still to pay", kind: "money" }],
        rows: p.open.map((b) => [b.number, b.payee, b.supplierRef, b.dueDate, b.state.daysOverdue || null, b.total, b.state.balance]),
        total: ["Total", null, null, null, null, null, p.owed],
      },
    ],
  };
}

async function salesReport(from: string, to: string, period: string): Promise<Report> {
  // net of credit notes: a cancelled invoice and its credit note cancel out in the same period
  const [byCustomer, byOwner, s] = await Promise.all([
    rows<{ name: string; invoices: number; net: number }>(sql`SELECT i.customer_name name, count(*) FILTER (WHERE i.status <> 'cancelled')::int invoices,
        (sum(i.subtotal) - coalesce(sum(c.subtotal), 0))::float net
      FROM invoices i LEFT JOIN credit_notes c ON c.invoice_id = i.id AND c.issue_date BETWEEN ${from} AND ${to}
      WHERE i.kind = 'sale' AND i.issue_date BETWEEN ${from} AND ${to} GROUP BY i.company_id, i.customer_name ORDER BY net DESC`),
    rows<{ name: string; invoices: number; net: number }>(sql`SELECT coalesce(u.name, 'No salesperson') name, count(*) FILTER (WHERE i.status <> 'cancelled')::int invoices,
        (sum(i.subtotal) - coalesce(sum(c.subtotal), 0))::float net
      FROM invoices i LEFT JOIN credit_notes c ON c.invoice_id = i.id AND c.issue_date BETWEEN ${from} AND ${to}
      LEFT JOIN deals d ON d.id = i.deal_id LEFT JOIN sales_orders so ON so.id = i.order_id LEFT JOIN quotes sq ON sq.id = so.quote_id
      LEFT JOIN users u ON u.id = coalesce(d.owner_id, sq.owner_id)
      WHERE i.kind = 'sale' AND i.issue_date BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY net DESC`),
    salesByMonth(from, to),
  ]);
  const months = monthsBetween(from, to).map((m) => ({ m, net: round2(n(s.inv.get(m)?.s) - n(s.cn.get(m)?.s)) }));
  const total = round2(months.reduce((a, m) => a + m.net, 0));
  const live = byCustomer.filter((c) => n(c.net) !== 0);
  return {
    title: "Sales",
    period,
    kpis: [
      { label: "Net sales", value: total, kind: "money", hint: "before VAT" },
      { label: "Customers invoiced", value: live.length, kind: "int" },
      { label: "Invoices", value: byCustomer.reduce((a, c) => a + c.invoices, 0), kind: "int" },
      { label: "Biggest customer", value: n(live[0]?.net), kind: "money", hint: live[0]?.name },
    ],
    tables: [
      { title: "By customer", columns: [{ label: "Customer" }, { label: "Invoices", kind: "int" }, { label: "Net sales", kind: "money" }, { label: "Share", kind: "pct" }], rows: live.map((c) => [c.name, c.invoices, n(c.net), pct(n(c.net), total)]), total: ["Total", null, total, total ? 100 : null] },
      { title: "By salesperson", columns: [{ label: "Salesperson" }, { label: "Invoices", kind: "int" }, { label: "Net sales", kind: "money" }, { label: "Share", kind: "pct" }], rows: byOwner.map((c) => [c.name, c.invoices, n(c.net), pct(n(c.net), total)]), total: ["Total", null, total, total ? 100 : null] },
      ...(months.length > 1 ? [{ title: "By month", columns: [{ label: "Month" }, { label: "Net sales", kind: "money" as const }], rows: months.map((m) => [monthLabel(m.m), m.net]), total: ["Total", total] }] : []),
    ],
  };
}

async function profitReport(from: string, to: string, period: string): Promise<Report> {
  // orders whose (not cancelled) invoice is dated in the period; real cost = supplier bills bought for the order
  const list = await rows<{ number: string; customer: string; invoice: string; sale: number; quoted: number | null; billed: number; bills: number }>(sql`
    SELECT o.number, i.customer_name customer, i.number invoice, i.subtotal::float sale, o.cost_total::float quoted,
      coalesce((SELECT sum(b.subtotal) FROM bills b WHERE b.order_id = o.id AND b.status <> 'void'), 0)::float billed,
      (SELECT count(*) FROM bills b WHERE b.order_id = o.id AND b.status <> 'void')::int bills
    FROM invoices i JOIN sales_orders o ON o.id = i.order_id
    WHERE i.kind = 'sale' AND i.status <> 'cancelled' AND i.issue_date BETWEEN ${from} AND ${to}`);
  const data = list
    .map((r) => {
      const cost = r.bills > 0 ? n(r.billed) : r.quoted != null ? n(r.quoted) : null;
      const profit = cost != null ? round2(n(r.sale) - cost) : null;
      return { ...r, cost, profit, margin: profit != null ? pct(profit, n(r.sale)) : null, basis: r.bills > 0 ? "Bills" : r.quoted != null ? "Quote" : "No cost" };
    })
    .sort((a, b) => (a.margin ?? 999) - (b.margin ?? 999));
  const sale = round2(data.reduce((s, r) => s + n(r.sale), 0));
  const withCost = data.filter((r) => r.profit != null);
  const profit = round2(withCost.reduce((s, r) => s + (r.profit ?? 0), 0));
  return {
    title: "Profit per order",
    period,
    kpis: [
      { label: "Orders invoiced", value: data.length, kind: "int" },
      { label: "Sales", value: sale, kind: "money", hint: "before VAT" },
      { label: "Profit", value: profit, kind: "money", hint: withCost.length < data.length ? `${data.length - withCost.length} without a cost left out` : undefined },
      { label: "Average margin", value: pct(profit, round2(withCost.reduce((s, r) => s + n(r.sale), 0))) ?? 0, kind: "pct" },
    ],
    tables: [
      {
        title: "Orders, lowest margin first",
        columns: [{ label: "Order" }, { label: "Customer" }, { label: "Invoice" }, { label: "Sale", kind: "money" }, { label: "Cost", kind: "money" }, { label: "Cost from" }, { label: "Profit", kind: "money" }, { label: "Margin", kind: "pct" }],
        rows: data.map((r) => [r.number, r.customer, r.invoice, n(r.sale), r.cost, r.basis, r.profit, r.margin]),
        total: ["Total", null, null, sale, null, null, profit, null],
        note: "Cost is the supplier bills linked to the order; without bills, the cost saved on the quote.",
      },
    ],
  };
}

async function cashReport(from: string, to: string, period: string): Promise<Report> {
  const [inRows, outRows] = await Promise.all([
    rows<{ m: string; method: string; s: number }>(sql`SELECT to_char(paid_on, 'YYYY-MM') m, method, sum(amount)::float s FROM payments WHERE voided_at IS NULL AND paid_on BETWEEN ${from} AND ${to} GROUP BY 1, 2`),
    rows<{ m: string; method: string; s: number }>(sql`SELECT to_char(paid_on, 'YYYY-MM') m, method, sum(amount)::float s FROM supplier_payments WHERE voided_at IS NULL AND paid_on BETWEEN ${from} AND ${to} GROUP BY 1, 2`),
  ]);
  const get = (list: typeof inRows, m: string, method?: string) => round2(list.filter((r) => r.m === m && (!method || r.method === method)).reduce((s, r) => s + n(r.s), 0));
  const months = monthsBetween(from, to);
  const table = months.map((m) => {
    const inn = get(inRows, m);
    const out = get(outRows, m);
    return [monthLabel(m), get(inRows, m, "cash"), get(inRows, m, "bank"), get(outRows, m, "cash"), get(outRows, m, "bank"), round2(inn - out)];
  });
  const tIn = round2(inRows.reduce((s, r) => s + n(r.s), 0));
  const tOut = round2(outRows.reduce((s, r) => s + n(r.s), 0));
  const col = (i: number) => round2(table.reduce((s, r) => s + Number(r[i]), 0));
  return {
    title: "Cash in and out",
    period,
    kpis: [
      { label: "Received", value: tIn, kind: "money" },
      { label: "Paid out", value: tOut, kind: "money" },
      { label: "Net", value: round2(tIn - tOut), kind: "money" },
    ],
    tables: [
      {
        title: "By month",
        columns: [{ label: "Month" }, { label: `In: ${methodLabel("cash")}`, kind: "money" }, { label: `In: ${methodLabel("bank")}`, kind: "money" }, { label: `Out: ${methodLabel("cash")}`, kind: "money" }, { label: `Out: ${methodLabel("bank")}`, kind: "money" }, { label: "Net", kind: "money" }],
        rows: table,
        total: ["Total", col(1), col(2), col(3), col(4), round2(tIn - tOut)],
        note: "Customer receipts and payment vouchers, voided ones left out.",
      },
    ],
  };
}

/** One report for a period (`receivables` and `payables` are as of today). */
export async function runReport(key: ReportKey, from: string, to: string, periodLabel: string): Promise<Report> {
  const period = `${periodLabel}: ${from} to ${to}`;
  const today = "As of today";
  switch (key) {
    case "pnl":
      return pnlReport(from, to, period);
    case "vat":
      return vatReport(from, to, period);
    case "receivables":
      return receivablesReport(today);
    case "payables":
      return payablesReport(today);
    case "sales":
      return salesReport(from, to, period);
    case "profit":
      return profitReport(from, to, period);
    case "cash":
      return cashReport(from, to, period);
  }
}

export const reportTitle = (k: ReportKey) => REPORTS.find((r) => r.key === k)!.label;
