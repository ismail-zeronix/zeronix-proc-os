import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { methodLabel, orderStatusLabel, termsLabel } from "@/lib/invoicing";
import { billKindLabel, categoryLabel } from "@/lib/purchases";
import { quoteStatusLabel } from "@/lib/quotation";
import { currentOrgId } from "@/lib/org";
import type { Cell, Column, Report } from "@/lib/reports";

/**
 * Ticked rows of an Accounts list as a report, so Excel, CSV and print all work as they do in the report centre. Every
 * list here is reached with the Accounts app, which sees every record.
 */
type Row = Record<string, unknown>;
const rows = async <T extends Row>(q: ReturnType<typeof sql>) => (await db.execute<T>(q)).rows;
const IN = (ids: number[]) => sql`(${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`;

function table(title: string, columns: Column[], data: Cell[][], landscape = true): Report {
  return { title, period: `${data.length} selected`, landscape, kpis: [], tables: [{ title, columns, rows: data }] };
}
const money = (label: string): Column => ({ label, kind: "money" });
const date = (label: string): Column => ({ label, kind: "date" });
const text = (label: string): Column => ({ label });

const BUILDERS: Record<string, (ids: number[]) => Promise<Report>> = {
  customers: async (ids) => {
    const list = await rows<{ name: string; trn: string; emirate: string; address: string; phone: string; owed: number }>(sql`
      SELECT c.name, c.trn, c.emirate, c.address, c.phone,
        coalesce((SELECT sum(i.total - i.credited_total - coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.invoice_id = i.id AND a.voided_at IS NULL), 0)) FROM invoices i WHERE i.company_id = c.id AND i.status <> 'cancelled'), 0)::float AS owed
      FROM companies c WHERE c.id IN ${IN(ids)} ORDER BY c.name`);
    return table("Customers", [text("Customer"), text("TRN"), text("Emirate"), text("Address"), text("Phone"), money("Owes")], list.map((r) => [r.name, r.trn, r.emirate, r.address, r.phone, r.owed]));
  },
  quotes: async (ids) => {
    const list = await rows<{ number: string; customer: string; status: string; date: string; valid: string; net: number; total: number }>(sql`
      SELECT q.number, c.name AS customer, q.status, to_char(q.created_at AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS date, q.valid_until::text AS valid, q.subtotal::float AS net, q.total::float AS total
      FROM quotes q JOIN companies c ON c.id = q.company_id WHERE q.id IN ${IN(ids)} ORDER BY q.id DESC`);
    return table("Quotes", [text("Quote"), text("Customer"), text("Status"), date("Made"), date("Valid until"), money("Before VAT"), money("Total")], list.map((r) => [r.number, r.customer, quoteStatusLabel(r.status), r.date, r.valid, r.net, r.total]));
  },
  orders: async (ids) => {
    const list = await rows<{ number: string; customer: string; ref: string; status: string; terms: number; delivered: string | null; total: number }>(sql`
      SELECT o.number, c.name AS customer, o.customer_ref AS ref, o.status, o.terms_days AS terms, o.delivered_on::text AS delivered, o.total::float AS total
      FROM sales_orders o JOIN companies c ON c.id = o.company_id WHERE o.id IN ${IN(ids)} ORDER BY o.id DESC`);
    return table("Sales orders", [text("Sales order"), text("Customer"), text("PO"), text("Status"), text("Terms"), date("Delivered"), money("Total")], list.map((r) => [r.number, r.customer, r.ref, orderStatusLabel(r.status), termsLabel(r.terms), r.delivered, r.total]));
  },
  invoices: async (ids) => {
    const list = await rows<{ number: string; date: string; due: string; name: string; trn: string; net: number; vat: number; gross: number; paid: number; status: string }>(sql`
      SELECT i.number, i.issue_date::text AS date, i.due_date::text AS due, i.customer_name AS name, i.customer_trn AS trn, i.subtotal::float AS net, i.vat_amount::float AS vat, i.total::float AS gross, i.status,
        coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.invoice_id = i.id AND a.voided_at IS NULL), 0)::float AS paid
      FROM invoices i WHERE i.id IN ${IN(ids)} ORDER BY i.issue_date DESC, i.id DESC`);
    return table(
      "Invoices",
      [text("Invoice"), date("Date"), date("Due"), text("Customer"), text("TRN"), money("Before VAT"), money("VAT"), money("Total"), money("Paid"), text("Status")],
      list.map((r) => [r.number, r.date, r.due, r.name, r.trn, r.net, r.vat, r.gross, r.paid, r.status === "cancelled" ? "Cancelled" : "Issued"]),
    );
  },
  "credit-notes": async (ids) => {
    const list = await rows<{ number: string; date: string; invoice: string; name: string; reason: string; net: number; vat: number; gross: number }>(sql`
      SELECT c.number, c.issue_date::text AS date, i.number AS invoice, i.customer_name AS name, c.reason, c.subtotal::float AS net, c.vat_amount::float AS vat, c.total::float AS gross
      FROM credit_notes c JOIN invoices i ON i.id = c.invoice_id WHERE c.id IN ${IN(ids)} ORDER BY c.issue_date DESC, c.id DESC`);
    return table("Credit notes", [text("Credit note"), date("Date"), text("Invoice"), text("Customer"), text("Why"), money("Before VAT"), money("VAT"), money("Total")], list.map((r) => [r.number, r.date, r.invoice, r.name, r.reason, r.net, r.vat, r.gross]));
  },
  "debit-notes": async (ids) => {
    const list = await rows<{ number: string; date: string; bill: string; name: string; reason: string; net: number; vat: number; gross: number }>(sql`
      SELECT d.number, d.issue_date::text AS date, b.number AS bill, coalesce(s.name, b.paid_to) AS name, d.reason, d.subtotal::float AS net, d.vat_amount::float AS vat, d.total::float AS gross
      FROM debit_notes d JOIN bills b ON b.id = d.bill_id LEFT JOIN suppliers s ON s.id = b.supplier_id WHERE d.id IN ${IN(ids)} ORDER BY d.issue_date DESC, d.id DESC`);
    return table("Debit notes", [text("Debit note"), date("Date"), text("Bill"), text("Supplier"), text("Why"), money("Before VAT"), money("VAT"), money("Total")], list.map((r) => [r.number, r.date, r.bill, r.name, r.reason, r.net, r.vat, r.gross]));
  },
  receipts: async (ids) => {
    const list = await rows<{ number: string; date: string; name: string; docs: string | null; method: string; ref: string; amount: number; voided: boolean }>(sql`
      SELECT x.number, x.paid_on::text AS date, c.name, x.method, x.reference AS ref, x.amount::float AS amount, x.voided_at IS NOT NULL AS voided,
        (SELECT string_agg(i.number, ', ' ORDER BY a.id) FROM payment_allocations a JOIN invoices i ON i.id = a.invoice_id WHERE a.payment_id = x.id AND (a.voided_at IS NULL OR a.voided_at = x.voided_at)) AS docs
      FROM payments x JOIN companies c ON c.id = x.company_id WHERE x.id IN ${IN(ids)} ORDER BY x.paid_on DESC, x.id DESC`);
    return table("Payments received", [text("Receipt"), date("Date"), text("Customer"), text("Invoices"), text("Paid by"), text("Reference"), money("Amount")], list.map((r) => [r.voided ? `${r.number} (voided)` : r.number, r.date, r.name, r.docs ?? "Advance", methodLabel(r.method), r.ref, r.voided ? null : r.amount]));
  },
  suppliers: async (ids) => {
    const list = await rows<{ name: string; trn: string; terms: number; iban: string; owed: number }>(sql`
      SELECT s.name, s.trn, s.terms_days AS terms, s.iban,
        coalesce((SELECT sum(b.total - b.credited_total - coalesce((SELECT sum(a.amount) FROM supplier_payment_allocations a WHERE a.bill_id = b.id AND a.voided_at IS NULL), 0)) FROM bills b WHERE b.supplier_id = s.id AND b.status <> 'void'), 0)::float AS owed
      FROM suppliers s WHERE s.id IN ${IN(ids)} ORDER BY s.name`);
    return table("Suppliers", [text("Supplier"), text("TRN"), text("Terms"), text("IBAN"), money("We owe")], list.map((r) => [r.name, r.trn, termsLabel(r.terms), r.iban, r.owed]));
  },
  bills: async (ids) => {
    const list = await rows<{ number: string; date: string; due: string; name: string; ref: string; category: string; kind: string; net: number; vat: number; gross: number; paid: number; status: string }>(sql`
      SELECT b.number, b.bill_date::text AS date, b.due_date::text AS due, coalesce(s.name, b.paid_to) AS name, b.supplier_ref AS ref, b.category, b.kind, b.subtotal::float AS net, b.vat_amount::float AS vat, b.total::float AS gross, b.status,
        coalesce((SELECT sum(a.amount) FROM supplier_payment_allocations a WHERE a.bill_id = b.id AND a.voided_at IS NULL), 0)::float AS paid
      FROM bills b LEFT JOIN suppliers s ON s.id = b.supplier_id WHERE b.id IN ${IN(ids)} ORDER BY b.bill_date DESC, b.id DESC`);
    return table(
      "Bills and expenses",
      [text("Number"), date("Date"), date("Due"), text("Paid to"), text("Their no."), text("Category"), text("Kind"), money("Before VAT"), money("VAT"), money("Total"), money("Paid")],
      list.map((r) => {
        const v = r.status === "void";
        return [v ? `${r.number} (void)` : r.number, r.date, r.due, r.name, r.ref, categoryLabel(r.category), billKindLabel(r.kind), v ? null : r.net, v ? null : r.vat, v ? null : r.gross, v ? null : r.paid];
      }),
    );
  },
  vouchers: async (ids) => {
    const list = await rows<{ number: string; date: string; name: string; docs: string | null; method: string; ref: string; amount: number; voided: boolean }>(sql`
      SELECT x.number, x.paid_on::text AS date, coalesce(s.name, x.paid_to) AS name, x.method, x.reference AS ref, x.amount::float AS amount, x.voided_at IS NOT NULL AS voided,
        (SELECT string_agg(b.number, ', ' ORDER BY a.id) FROM supplier_payment_allocations a JOIN bills b ON b.id = a.bill_id WHERE a.payment_id = x.id AND (a.voided_at IS NULL OR a.voided_at = x.voided_at)) AS docs
      FROM supplier_payments x LEFT JOIN suppliers s ON s.id = x.supplier_id WHERE x.id IN ${IN(ids)} ORDER BY x.paid_on DESC, x.id DESC`);
    return table("Payments made", [text("Voucher"), date("Date"), text("Paid to"), text("For"), text("Paid by"), text("Reference"), money("Amount")], list.map((r) => [r.voided ? `${r.number} (voided)` : r.number, r.date, r.name, r.docs ?? "Advance", methodLabel(r.method), r.ref, r.voided ? null : r.amount]));
  },
  journals: async (ids) => {
    const orgId = await currentOrgId();
    const list = await rows<{ number: string; date: string; memo: string; source: string; code: string; account: string; debit: number; credit: number }>(sql`
      SELECT e.number, e.date::text AS date, e.memo, e.source_type AS source, a.code, a.name AS account, l.debit::float AS debit, l.credit::float AS credit
      FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
      WHERE e.organization_id = ${orgId} AND e.id IN ${IN(ids)} ORDER BY e.date DESC, e.id DESC, l.line_no`);
    return table("Journal entries", [text("Entry"), date("Date"), text("What for"), text("Account"), money("Debit"), money("Credit")], list.map((r) => [r.number, r.date, r.memo, `${r.code} ${r.account}`, r.debit || null, r.credit || null]));
  },
};

/** Lists only an accountant may take out. */
const ACCOUNTANT_ONLY = new Set(["journals"]);

export const isExportList = (key: string) => key in BUILDERS;
export const canExportList = (key: string, access: { finance: boolean; accountant: boolean }) => access.finance && (!ACCOUNTANT_ONLY.has(key) || access.accountant);

/** "1,2,3" as ids. A page holds 100 rows at most, so a longer list than that is not a page of a list. */
export function parseIds(s: string | null | undefined): number[] {
  const ids = (s ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)].slice(0, 100);
}

export async function listReport(key: string, ids: number[]): Promise<Report> {
  return BUILDERS[key](ids.length ? ids : [0]);
}
