import "server-only";
import { sql } from "drizzle-orm";
import { receivables } from "@/lib/accounts-data";
import { withOrg } from "@/lib/org";
import { payables } from "@/lib/purchases-data";
import { round2 } from "@/lib/quotation";
import type { Tx } from "@/lib/tx";
import { ledgerStart, openingEntry } from "./documents";

export { openingEntry };
import type { PartyBalance } from "./opening";
import { ensureLedger } from "./setup";

/**
 * What each customer owed and what we owed each supplier on the evening before the cut-over, from the portal's own
 * documents: invoices (portal and Zoho opening ones) less credit notes and payments dated before the cut-over; bills
 * (and opening bills) less payments. Expenses are paid on the spot, so they owe nothing.
 */
export async function partyBalancesAt(tx: Tx, cutover: string): Promise<{ customers: PartyBalance[]; suppliers: PartyBalance[] }> {
  const customers = await tx.execute<{ id: number; name: string; amount: number }>(sql`
    SELECT c.id, c.name, round((coalesce(i.total, 0) - coalesce(cn.total, 0) - coalesce(p.total, 0))::numeric, 2)::float AS amount
    FROM companies c
    LEFT JOIN (SELECT company_id, sum(total) total FROM invoices
               WHERE issue_date < ${cutover} AND NOT (kind = 'opening' AND status = 'cancelled') GROUP BY company_id) i ON i.company_id = c.id
    LEFT JOIN (SELECT inv.company_id, sum(cn.total) total FROM credit_notes cn JOIN invoices inv ON inv.id = cn.invoice_id
               WHERE cn.issue_date < ${cutover} GROUP BY inv.company_id) cn ON cn.company_id = c.id
    LEFT JOIN (SELECT inv.company_id, sum(a.amount) total FROM payment_allocations a JOIN invoices inv ON inv.id = a.invoice_id
               WHERE a.applied_on < ${cutover} AND a.voided_at IS NULL GROUP BY inv.company_id) p ON p.company_id = c.id
    WHERE i.total IS NOT NULL
    ORDER BY c.name`);
  const suppliers = await tx.execute<{ id: number; name: string; amount: number }>(sql`
    SELECT s.id, s.name, round((coalesce(b.total, 0) - coalesce(p.total, 0))::numeric, 2)::float AS amount
    FROM suppliers s
    JOIN (SELECT supplier_id, sum(total) total FROM bills
          WHERE bill_date < ${cutover} AND status <> 'void' AND kind IN ('bill', 'opening') GROUP BY supplier_id) b ON b.supplier_id = s.id
    LEFT JOIN (SELECT bb.supplier_id, sum(a.amount) total FROM supplier_payment_allocations a JOIN bills bb ON bb.id = a.bill_id
               WHERE a.applied_on < ${cutover} AND a.voided_at IS NULL AND bb.kind IN ('bill', 'opening') GROUP BY bb.supplier_id) p ON p.supplier_id = s.id
    ORDER BY s.name`);
  return {
    customers: customers.rows.filter((r) => Math.abs(r.amount) >= 0.005),
    suppliers: suppliers.rows.filter((r) => Math.abs(r.amount) >= 0.005),
  };
}

export interface LedgerCheck {
  label: string;
  hint: string;
  documents: number;
  ledger: number;
  difference: number;
}

/** Balance of a system account on its natural side (assets: debits less credits; liabilities: credits less debits). */
async function accountBalance(tx: Tx, orgId: number, key: string, side: 1 | -1, opts: { from?: string; skipOpening?: boolean } = {}) {
  const r = await tx.execute<{ b: number }>(sql`
    SELECT coalesce(sum(l.debit - l.credit), 0)::float b
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE l.organization_id = ${orgId} AND a.system_key = ${key}
      ${opts.from ? sql`AND e.date >= ${opts.from}` : sql``}
      ${opts.skipOpening ? sql`AND e.source_type <> 'opening'` : sql``}`);
  return round2(r.rows[0].b * side);
}

/**
 * The ledger against the documents it came from: what customers owe, what we owe suppliers, and the VAT since the
 * cut-over. All of them should agree once the opening balances and the existing documents are posted.
 */
export function ledgerChecks(orgId: number): Promise<{ start: string | null; checks: LedgerCheck[] }> {
  return withOrg(orgId, async (tx) => {
    await ensureLedger(tx, orgId);
    const start = await ledgerStart(tx, orgId);
    if (!start) return { start, checks: [] };
    const [rec, pay] = await Promise.all([receivables(), payables()]);
    const docVat = await tx.execute<{ output: number; input: number }>(sql`
      SELECT
        (SELECT coalesce(sum(vat_amount), 0) FROM invoices WHERE kind = 'sale' AND issue_date >= ${start})
          - (SELECT coalesce(sum(cn.vat_amount), 0) FROM credit_notes cn JOIN invoices i ON i.id = cn.invoice_id WHERE i.kind = 'sale' AND cn.issue_date >= ${start}) AS output,
        (SELECT coalesce(sum(vat_amount), 0) FROM bills WHERE kind IN ('bill', 'expense') AND status <> 'void' AND bill_date >= ${start}) AS input`);
    const v = docVat.rows[0];
    const advances = await tx.execute<{ customers: number; suppliers: number }>(sql`
      SELECT
        (SELECT coalesce(sum(p.amount - coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.payment_id = p.id AND a.voided_at IS NULL), 0) - coalesce((SELECT sum(r.amount) FROM advance_refunds r WHERE r.payment_id = p.id AND r.voided_at IS NULL), 0)), 0)
          FROM payments p WHERE p.voided_at IS NULL)::float AS customers,
        (SELECT coalesce(sum(p.amount - coalesce((SELECT sum(a.amount) FROM supplier_payment_allocations a WHERE a.payment_id = p.id AND a.voided_at IS NULL), 0) - coalesce((SELECT sum(r.amount) FROM advance_refunds r WHERE r.supplier_payment_id = p.id AND r.voided_at IS NULL), 0)), 0)
          FROM supplier_payments p WHERE p.voided_at IS NULL)::float AS suppliers`);
    const rows: Omit<LedgerCheck, "difference">[] = [
      { label: "Customers owe us", hint: "Open invoices in Accounts against Accounts receivable", documents: rec.owed, ledger: await accountBalance(tx, orgId, "ar", 1) },
      { label: "We owe suppliers", hint: "Unpaid bills in Accounts against Accounts payable", documents: pay.owed, ledger: await accountBalance(tx, orgId, "ap", -1) },
      { label: "Advances from customers", hint: "Receipts not set against an invoice against Customer advances", documents: round2(Number(advances.rows[0].customers)), ledger: await accountBalance(tx, orgId, "customer_advances", -1) },
      { label: "Advances to suppliers", hint: "Vouchers not set against a bill against Advances to suppliers", documents: round2(Number(advances.rows[0].suppliers)), ledger: await accountBalance(tx, orgId, "supplier_advances", 1) },
      { label: "VAT on sales since the cut-over", hint: "Invoices less credit notes against VAT output", documents: round2(Number(v.output)), ledger: await accountBalance(tx, orgId, "vat_output", -1, { from: start, skipOpening: true }) },
      { label: "VAT on purchases since the cut-over", hint: "Bills and expenses against VAT input", documents: round2(Number(v.input)), ledger: await accountBalance(tx, orgId, "vat_input", 1, { from: start, skipOpening: true }) },
    ];
    return { start, checks: rows.map((r) => ({ ...r, difference: round2(r.ledger - r.documents) })) };
  });
}
