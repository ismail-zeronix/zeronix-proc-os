import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import { round2 } from "@/lib/quotation";
import { cleanLayout, type WidgetPlacement } from "@/lib/dashboard-widgets";

/** The figures behind the Accounts overview. Each widget asks only for what it shows, and a page asks once (cache). */

type Row = Record<string, unknown>;
const rows = async <T extends Row>(q: ReturnType<typeof sql>) => (await db.execute<T>(q)).rows;

/** Someone's saved overview, or the usual one. */
export async function dashboardLayout(userId: number, accountant: boolean): Promise<WidgetPlacement[]> {
  const d = schema.dashboardLayouts;
  const [row] = await db.select({ layout: d.layout }).from(d).where(and(eq(d.userId, userId), eq(d.dashboard, "accounts")));
  return cleanLayout(row?.layout, accountant);
}

/** Is the ledger switched on, and what is locked? */
export const booksState = cache(async (orgId: number) => {
  const s = schema.accountingSettings;
  const [row] = await db.select({ cutover: s.cutoverDate, lockDate: s.lockDate }).from(s).where(eq(s.organizationId, orgId));
  return { on: !!row?.cutover, cutover: row?.cutover ?? null, lockDate: row?.lockDate ?? null };
});

/** Balances today: cash and bank together, and the system accounts the tiles show. Debits less credits. */
export const ledgerBalances = cache(async (orgId: number) => {
  const list = await rows<{ subtype: string; key: string | null; b: number }>(sql`
    SELECT a.subtype, a.system_key AS key, sum(l.debit - l.credit)::float AS b
    FROM journal_lines l JOIN accounts a ON a.id = l.account_id
    WHERE l.organization_id = ${orgId}
    GROUP BY 1, 2`);
  const byKey = (k: string) => Number(list.find((r) => r.key === k)?.b ?? 0);
  return {
    cash: round2(list.filter((r) => r.subtype === "cash" || r.subtype === "bank").reduce((s, r) => s + Number(r.b), 0)),
    stock: round2(byKey("inventory")),
    customerAdvances: round2(-byKey("customer_advances")),
    supplierAdvances: round2(byKey("supplier_advances")),
  };
});

/** Income and costs from the ledger in a period, leaving out the opening entry (Zoho's figures, all on one day). */
export const ledgerResult = cache(async (orgId: number, from: string, to: string) => {
  const list = await rows<{ type: string; subtype: string; net: number }>(sql`
    SELECT a.type, a.subtype, sum(l.credit - l.debit)::float AS net
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE l.organization_id = ${orgId} AND e.date BETWEEN ${from} AND ${to} AND e.source_type <> 'opening' AND a.type IN ('income', 'expense')
    GROUP BY 1, 2`);
  const sum = (f: (r: { type: string; subtype: string }) => boolean) => round2(list.filter(f).reduce((s, r) => s + Number(r.net), 0));
  const income = sum((r) => r.type === "income");
  const cost = -sum((r) => r.type === "expense" && r.subtype === "cogs");
  const expenses = -sum((r) => r.type === "expense" && r.subtype !== "cogs");
  return { income, cost, gross: round2(income - cost), expenses, profit: round2(income - cost - expenses) };
});

/** VAT in a period from the ledger: on sales, on purchases, and what is left to pay (below zero: to reclaim). */
export const ledgerVat = cache(async (orgId: number, from: string, to: string) => {
  const list = await rows<{ key: string; net: number }>(sql`
    SELECT a.system_key AS key, sum(l.credit - l.debit)::float AS net
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE l.organization_id = ${orgId} AND e.date BETWEEN ${from} AND ${to} AND e.source_type <> 'opening' AND a.system_key IN ('vat_output', 'vat_input')
    GROUP BY 1`);
  const output = round2(Number(list.find((r) => r.key === "vat_output")?.net ?? 0));
  const input = round2(-Number(list.find((r) => r.key === "vat_input")?.net ?? 0));
  return { output, input, net: round2(output - input) };
});

/** Sales before VAT in a period, from the documents: invoices issued less credit notes. */
export const salesBetween = cache(async (from: string, to: string) => {
  const [r] = await rows<{ net: number; n: number }>(sql`
    SELECT
      (coalesce((SELECT sum(subtotal) FROM invoices WHERE kind = 'sale' AND issue_date BETWEEN ${from} AND ${to}), 0)
        - coalesce((SELECT sum(c.subtotal) FROM credit_notes c JOIN invoices i ON i.id = c.invoice_id WHERE i.kind = 'sale' AND c.issue_date BETWEEN ${from} AND ${to}), 0))::float AS net,
      (SELECT count(*)::int FROM invoices WHERE kind = 'sale' AND status <> 'cancelled' AND issue_date BETWEEN ${from} AND ${to}) AS n`);
  return { net: round2(Number(r.net)), count: Number(r.n) };
});

/** Money in and out in a period, from the receipts and vouchers. */
export const moneyBetween = cache(async (from: string, to: string) => {
  const [r] = await rows<{ inn: number; out: number }>(sql`
    SELECT
      (coalesce((SELECT sum(amount) FROM payments WHERE voided_at IS NULL AND paid_on BETWEEN ${from} AND ${to}), 0)
        + coalesce((SELECT sum(amount) FROM advance_refunds WHERE party = 'supplier' AND voided_at IS NULL AND refunded_on BETWEEN ${from} AND ${to}), 0))::float AS inn,
      (coalesce((SELECT sum(amount) FROM supplier_payments WHERE voided_at IS NULL AND paid_on BETWEEN ${from} AND ${to}), 0)
        + coalesce((SELECT sum(amount) FROM advance_refunds WHERE party = 'customer' AND voided_at IS NULL AND refunded_on BETWEEN ${from} AND ${to}), 0))::float AS out`);
  return { in: round2(Number(r.inn)), out: round2(Number(r.out)) };
});

export const salesByMonth = (from: string, to: string) =>
  rows<{ m: string; net: number }>(sql`
    SELECT m, sum(net)::float AS net FROM (
      SELECT to_char(issue_date, 'YYYY-MM') AS m, subtotal AS net FROM invoices WHERE kind = 'sale' AND issue_date BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT to_char(c.issue_date, 'YYYY-MM'), -c.subtotal FROM credit_notes c JOIN invoices i ON i.id = c.invoice_id WHERE i.kind = 'sale' AND c.issue_date BETWEEN ${from} AND ${to}
    ) x GROUP BY 1`);

export const ledgerByMonth = (orgId: number, from: string, to: string) =>
  rows<{ m: string; income: number; costs: number }>(sql`
    SELECT to_char(e.date, 'YYYY-MM') AS m,
      coalesce(sum(l.credit - l.debit) FILTER (WHERE a.type = 'income'), 0)::float AS income,
      coalesce(sum(l.debit - l.credit) FILTER (WHERE a.type = 'expense'), 0)::float AS costs
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE l.organization_id = ${orgId} AND e.date BETWEEN ${from} AND ${to} AND e.source_type <> 'opening' AND a.type IN ('income', 'expense')
    GROUP BY 1`);

export const moneyByMonth = (from: string, to: string) =>
  rows<{ m: string; inn: number; out: number }>(sql`
    SELECT m, sum(inn)::float AS inn, sum(out)::float AS out FROM (
      SELECT to_char(paid_on, 'YYYY-MM') AS m, amount AS inn, 0 AS out FROM payments WHERE voided_at IS NULL AND paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT to_char(paid_on, 'YYYY-MM'), 0, amount FROM supplier_payments WHERE voided_at IS NULL AND paid_on BETWEEN ${from} AND ${to}
      UNION ALL
      SELECT to_char(refunded_on, 'YYYY-MM'), CASE party WHEN 'supplier' THEN amount ELSE 0 END, CASE party WHEN 'customer' THEN amount ELSE 0 END FROM advance_refunds WHERE voided_at IS NULL AND refunded_on BETWEEN ${from} AND ${to}
    ) x GROUP BY 1`);

export const topCustomers = (from: string, to: string, limit = 8) =>
  rows<{ name: string; net: number; n: number }>(sql`
    SELECT customer_name AS name, sum(subtotal)::float AS net, count(*)::int AS n
    FROM invoices WHERE kind = 'sale' AND status <> 'cancelled' AND issue_date BETWEEN ${from} AND ${to}
    GROUP BY 1 ORDER BY net DESC LIMIT ${limit}`);

export const topSuppliers = (from: string, to: string, limit = 8) =>
  rows<{ name: string; net: number; n: number }>(sql`
    SELECT coalesce(s.name, b.paid_to) AS name, sum(b.subtotal - b.credited_net)::float AS net, count(*)::int AS n
    FROM bills b LEFT JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.status <> 'void' AND b.kind IN ('bill', 'expense') AND b.bill_date BETWEEN ${from} AND ${to}
    GROUP BY 1 ORDER BY net DESC LIMIT ${limit}`);

/** Running costs by category: goods and services bought for sale are cost of sales, not running costs. */
export const costsByCategory = (from: string, to: string) =>
  rows<{ category: string; net: number }>(sql`
    SELECT category, sum(subtotal)::float AS net
    FROM bills WHERE status <> 'void' AND kind IN ('bill', 'expense') AND category NOT IN ('cogs', 'services') AND bill_date BETWEEN ${from} AND ${to}
    GROUP BY 1 ORDER BY net DESC`);

/** Invoices in a period with no supplier bill behind them: their profit looks too high. */
export const soldWithoutCost = (from: string, to: string, limit = 8) =>
  rows<{ id: number; number: string; name: string; date: string; net: number }>(sql`
    SELECT i.id, i.number, i.customer_name AS name, i.issue_date::text AS date, i.subtotal::float AS net
    FROM invoices i
    WHERE i.kind = 'sale' AND i.status = 'issued' AND i.issue_date BETWEEN ${from} AND ${to}
      AND NOT EXISTS (SELECT 1 FROM bills b WHERE (b.invoice_id = i.id OR (i.order_id IS NOT NULL AND b.order_id = i.order_id)) AND b.status <> 'void' AND b.category IN ('cogs', 'services'))
    ORDER BY i.subtotal DESC LIMIT ${limit}`);
