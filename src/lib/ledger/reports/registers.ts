import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { statement } from "@/lib/accounts-data";
import { buildStatement, methodLabel } from "@/lib/invoicing";
import { fromMinor, sumMinor, toMinor } from "@/lib/money";
import { currentOrgId } from "@/lib/org";
import { categoryLabel } from "@/lib/purchases";
import { longDay } from "@/lib/quotation";
import type { ReportParams } from "@/lib/report-centre";
import { monthLabel, monthsBetween, type Cell, type Report } from "@/lib/reports";
import { buildAgeing, type AgedDoc } from "./build";
import { ledgerBalanceOf } from "./data";
import { vatCheckReport, vatReturnReport } from "@/lib/ledger/vat";

/** Reports read straight from the documents: they work with or without the ledger. */

type Row = Record<string, unknown>;
const rows = async <T extends Row>(q: ReturnType<typeof sql>) => (await db.execute<T>(q)).rows;
const total = (xs: readonly (number | null | undefined)[]) => fromMinor(sumMinor(xs.map((x) => toMinor(Number(x ?? 0)))));

export const REGISTER_LIMIT = 5000;
/** How many rows a file for download may carry. */
export const EXPORT_ROW_LIMIT = 200_000;
const cap = (p: ReportParams) => (p.full ? EXPORT_ROW_LIMIT : REGISTER_LIMIT);
const cutNote = (n: number, p: ReportParams) => (n >= cap(p) ? `Only the first ${cap(p).toLocaleString("en-US")} rows are shown: pick a shorter period.` : undefined);

async function agedReceivables(p: ReportParams): Promise<Report> {
  const docs = await rows<AgedDoc & { id: number }>(sql`
    SELECT i.id, i.number, i.company_id AS "partyId", i.customer_name AS party, i.issue_date::text AS "issueDate", i.due_date::text AS "dueDate", i.total::float AS total,
      (i.total
        - coalesce((SELECT sum(a.amount) FROM payment_allocations a WHERE a.invoice_id = i.id AND a.voided_at IS NULL AND a.applied_on <= ${p.to}), 0)
        - coalesce((SELECT sum(c.total) FROM credit_notes c WHERE c.invoice_id = i.id AND c.issue_date <= ${p.to}), 0))::float AS balance
    FROM invoices i
    WHERE i.issue_date <= ${p.to} AND NOT (i.kind = 'opening' AND i.status = 'cancelled')`);
  return buildAgeing({
    title: "Customers owe",
    partyLabel: "Customer",
    docs: docs.map((d) => ({ ...d, href: `/accounts/invoices/${d.id}` })),
    asOf: p.to,
    period: p.label,
    ledger: await ledgerBalanceOf("ar", 1, p.to),
    ledgerName: "Accounts receivable",
    partyHref: (id) => `/accounts/reports?r=customer-statement&party=${id}&period=this-year`,
  });
}

async function agedPayables(p: ReportParams): Promise<Report> {
  const docs = await rows<AgedDoc & { id: number }>(sql`
    SELECT b.id, b.number, b.supplier_id AS "partyId", coalesce(s.name, b.paid_to) AS party, b.bill_date::text AS "issueDate", b.due_date::text AS "dueDate", b.total::float AS total,
      (b.total
        - coalesce((SELECT sum(a.amount) FROM supplier_payment_allocations a WHERE a.bill_id = b.id AND a.voided_at IS NULL AND a.applied_on <= ${p.to}), 0)
        - coalesce((SELECT sum(d.total) FROM debit_notes d WHERE d.bill_id = b.id AND d.issue_date <= ${p.to}), 0))::float AS balance
    FROM bills b LEFT JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.bill_date <= ${p.to} AND b.status <> 'void' AND b.kind IN ('bill', 'opening')`);
  return buildAgeing({
    title: "We owe suppliers",
    partyLabel: "Supplier",
    docs: docs.map((d) => ({ ...d, href: `/accounts/bills/${d.id}` })),
    asOf: p.to,
    period: p.label,
    ledger: await ledgerBalanceOf("ap", -1, p.to),
    ledgerName: "Accounts payable",
    partyHref: (id) => `/accounts/reports?r=supplier-statement&party=${id}&period=this-year`,
  });
}

const pickFirst = (title: string, who: string, period: string): Report => ({
  title,
  period,
  kpis: [],
  tables: [{ title, columns: [{ label: "Date", kind: "date" }, { label: "Document" }, { label: "Details" }, { label: "Amount", kind: "money" }], rows: [], note: `Pick a ${who} above.` }],
});

async function customerStatement(p: ReportParams): Promise<Report> {
  if (!p.party) return pickFirst("Customer statement", "customer", p.label);
  const s = await statement(p.party, p.from, p.to);
  if (!s) return pickFirst("Customer statement", "customer", p.label);
  const kinds = { invoice: "Invoice", payment: "Payment", credit: "Credit note", refund: "Refund" } as const;
  return {
    title: `Statement: ${s.company.name}`,
    period: p.label,
    kpis: [
      { label: "Brought forward", value: s.opening, kind: "money" },
      { label: "Invoiced", value: total(s.lines.map((l) => l.debit)), kind: "money" },
      { label: "Paid and credited", value: total(s.lines.map((l) => l.credit)), kind: "money" },
      { label: "Balance due", value: s.closing, kind: "money" },
    ],
    tables: [
      {
        title: "Statement of account",
        columns: [{ label: "Date", kind: "date" }, { label: "Document" }, { label: "Details" }, { label: "Invoiced", kind: "money" }, { label: "Paid / credited", kind: "money" }, { label: "Balance", kind: "money" }],
        rows: [[null, null, "Balance brought forward", null, null, s.opening], ...s.lines.map((l): Cell[] => [l.date, l.number, `${kinds[l.kind]}${l.note ? ` · ${l.note}` : ""}`, l.debit || null, l.credit || null, l.balance])],
        total: ["Balance due", null, null, total(s.lines.map((l) => l.debit)), total(s.lines.map((l) => l.credit)), s.closing],
      },
    ],
  };
}

async function supplierStatement(p: ReportParams): Promise<Report> {
  if (!p.party) return pickFirst("Supplier statement", "supplier", p.label);
  const [supplier] = await rows<{ name: string }>(sql`SELECT name FROM suppliers WHERE id = ${p.party}`);
  if (!supplier) return pickFirst("Supplier statement", "supplier", p.label);
  const bills = await rows<{ date: string; number: string; amount: number; ref: string; due: string }>(sql`
    SELECT bill_date::text AS date, number, total::float AS amount, supplier_ref AS ref, due_date::text AS due
    FROM bills WHERE supplier_id = ${p.party} AND status <> 'void' AND kind IN ('bill', 'opening')`);
  // an expense's own voucher is left out: the expense was never on the statement either
  const pays = await rows<{ date: string; number: string; amount: number; bills: string | null; ref: string }>(sql`
    SELECT x.paid_on::text AS date, x.number, x.amount::float AS amount, x.reference AS ref,
      (SELECT string_agg(b.number, ', ' ORDER BY a.id) FROM supplier_payment_allocations a JOIN bills b ON b.id = a.bill_id WHERE a.payment_id = x.id AND a.voided_at IS NULL) AS bills
    FROM supplier_payments x
    WHERE x.supplier_id = ${p.party} AND x.voided_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM supplier_payment_allocations a JOIN bills b ON b.id = a.bill_id WHERE a.payment_id = x.id AND b.kind = 'expense')`);
  const debits = await rows<{ date: string; number: string; amount: number; bill: string }>(sql`
    SELECT d.issue_date::text AS date, d.number, d.total::float AS amount, b.number AS bill FROM debit_notes d JOIN bills b ON b.id = d.bill_id WHERE b.supplier_id = ${p.party}`);
  const refunds = await rows<{ date: string; number: string; amount: number; of: string }>(sql`
    SELECT r.refunded_on::text AS date, r.number, r.amount::float AS amount, x.number AS of FROM advance_refunds r JOIN supplier_payments x ON x.id = r.supplier_payment_id WHERE x.supplier_id = ${p.party} AND r.voided_at IS NULL`);
  const entries = [
    ...refunds.map((r) => ({ date: r.date, kind: "refund" as const, number: r.number, amount: r.amount, note: `Advance ${r.of} refunded to us` })),
    ...bills.map((b) => ({ date: b.date, kind: "invoice" as const, number: b.number, amount: b.amount, note: `${b.ref ? `Their no. ${b.ref} · ` : ""}Due ${longDay(b.due)}` })),
    ...debits.map((d) => ({ date: d.date, kind: "credit" as const, number: d.number, amount: d.amount, note: `For ${d.bill}` })),
    ...pays.map((x) => ({ date: x.date, kind: "payment" as const, number: x.number, amount: x.amount, note: [x.bills ? `For ${x.bills}` : "Advance", x.ref].filter(Boolean).join(" · ") })),
  ];
  const before = buildStatement(entries.filter((e) => e.date < p.from));
  const within = buildStatement(entries.filter((e) => e.date >= p.from && e.date <= p.to), before.closing);
  return {
    title: `Statement: ${supplier.name}`,
    period: p.label,
    kpis: [
      { label: "Brought forward", value: before.closing, kind: "money" },
      { label: "Billed", value: total(within.lines.map((l) => l.debit)), kind: "money" },
      { label: "Paid", value: total(within.lines.map((l) => l.credit)), kind: "money" },
      { label: "We owe", value: within.closing, kind: "money" },
    ],
    tables: [
      {
        title: "Supplier statement",
        columns: [{ label: "Date", kind: "date" }, { label: "Document" }, { label: "Details" }, { label: "Billed", kind: "money" }, { label: "Paid", kind: "money" }, { label: "Balance", kind: "money" }],
        rows: [[null, null, "Balance brought forward", null, null, before.closing], ...within.lines.map((l): Cell[] => [l.date, l.number, l.note ?? "", l.debit || null, l.credit || null, l.balance])],
        total: ["We owe", null, null, total(within.lines.map((l) => l.debit)), total(within.lines.map((l) => l.credit)), within.closing],
      },
    ],
  };
}

async function invoiceRegister(p: ReportParams): Promise<Report> {
  const list = await rows<{ id: number; number: string; date: string; name: string; trn: string; net: number; vat: number; gross: number; status: string; kind: string }>(sql`
    SELECT id, number, issue_date::text AS date, customer_name AS name, customer_trn AS trn, subtotal::float AS net, vat_amount::float AS vat, total::float AS gross, status, kind
    FROM invoices WHERE issue_date BETWEEN ${p.from} AND ${p.to} ORDER BY issue_date, id LIMIT ${cap(p)}`);
  const links: Record<number, string> = {};
  list.forEach((r, i) => (links[i] = `/accounts/invoices/${r.id}`));
  return {
    title: "Invoice register",
    period: p.label,
    landscape: true,
    kpis: [
      { label: "Invoices", value: list.length, kind: "int" },
      { label: "Before VAT", value: total(list.map((r) => r.net)), kind: "money" },
      { label: "VAT", value: total(list.map((r) => r.vat)), kind: "money" },
      { label: "With VAT", value: total(list.map((r) => r.gross)), kind: "money" },
    ],
    tables: [
      {
        title: "Invoices issued",
        columns: [{ label: "Invoice" }, { label: "Date", kind: "date" }, { label: "Customer" }, { label: "TRN" }, { label: "Before VAT", kind: "money" }, { label: "VAT", kind: "money" }, { label: "Total", kind: "money" }, { label: "Status" }],
        rows: list.map((r) => [r.number, r.date, r.name, r.trn, r.net, r.vat, r.gross, r.kind === "opening" ? "Opening from Zoho" : r.status === "cancelled" ? "Cancelled" : "Issued"]),
        links,
        total: ["Total", null, null, null, total(list.map((r) => r.net)), total(list.map((r) => r.vat)), total(list.map((r) => r.gross)), null],
        note: cutNote(list.length, p) ?? "Includes cancelled invoices: their credit notes take them back out.",
      },
    ],
  };
}

async function creditRegister(p: ReportParams): Promise<Report> {
  const list = await rows<{ number: string; date: string; invoice: string; invoiceId: number; name: string; reason: string; net: number; vat: number; gross: number }>(sql`
    SELECT c.number, c.issue_date::text AS date, i.number AS invoice, i.id AS "invoiceId", i.customer_name AS name, c.reason, c.subtotal::float AS net, c.vat_amount::float AS vat, c.total::float AS gross
    FROM credit_notes c JOIN invoices i ON i.id = c.invoice_id
    WHERE c.issue_date BETWEEN ${p.from} AND ${p.to} ORDER BY c.issue_date, c.id LIMIT ${cap(p)}`);
  const links: Record<number, string> = {};
  list.forEach((r, i) => (links[i] = `/accounts/invoices/${r.invoiceId}`));
  return {
    title: "Credit note register",
    period: p.label,
    landscape: true,
    kpis: [
      { label: "Credit notes", value: list.length, kind: "int" },
      { label: "Before VAT", value: total(list.map((r) => r.net)), kind: "money" },
      { label: "VAT", value: total(list.map((r) => r.vat)), kind: "money" },
      { label: "With VAT", value: total(list.map((r) => r.gross)), kind: "money" },
    ],
    tables: [
      {
        title: "Credit notes issued",
        columns: [{ label: "Credit note" }, { label: "Date", kind: "date" }, { label: "Invoice" }, { label: "Customer" }, { label: "Reason" }, { label: "Before VAT", kind: "money" }, { label: "VAT", kind: "money" }, { label: "Total", kind: "money" }],
        rows: list.map((r) => [r.number, r.date, r.invoice, r.name, r.reason, r.net, r.vat, r.gross]),
        links,
        total: ["Total", null, null, null, null, total(list.map((r) => r.net)), total(list.map((r) => r.vat)), total(list.map((r) => r.gross))],
        note: cutNote(list.length, p),
      },
    ],
  };
}

async function refundRegister(p: ReportParams): Promise<Report> {
  const list = await rows<{ number: string; date: string; who: string; direction: string; of: string; method: string; reference: string; reason: string; amount: number }>(sql`
    SELECT r.number, r.refunded_on::text AS date, coalesce(c.name, s.name, x.paid_to, '') AS who, CASE r.party WHEN 'customer' THEN 'Paid to customer' ELSE 'Received from supplier' END AS direction,
      coalesce(pc.number, x.number) AS of, r.method, r.reference, r.reason, r.amount::float AS amount
    FROM advance_refunds r
    LEFT JOIN payments pc ON pc.id = r.payment_id LEFT JOIN companies c ON c.id = pc.company_id
    LEFT JOIN supplier_payments x ON x.id = r.supplier_payment_id LEFT JOIN suppliers s ON s.id = x.supplier_id
    WHERE r.voided_at IS NULL AND r.refunded_on BETWEEN ${p.from} AND ${p.to} ORDER BY r.refunded_on, r.id LIMIT ${cap(p)}`);
  return {
    title: "Refunds of advances",
    period: p.label,
    landscape: true,
    kpis: [
      { label: "Refunds", value: list.length, kind: "int" },
      { label: "Paid to customers", value: total(list.filter((r) => r.direction.startsWith("Paid")).map((r) => r.amount)), kind: "money" },
      { label: "Received from suppliers", value: total(list.filter((r) => !r.direction.startsWith("Paid")).map((r) => r.amount)), kind: "money" },
    ],
    tables: [
      {
        title: "Refunds",
        columns: [{ label: "Refund" }, { label: "Date", kind: "date" }, { label: "Customer or supplier" }, { label: "Direction" }, { label: "Advance" }, { label: "Paid by" }, { label: "Reference" }, { label: "Reason" }, { label: "Amount", kind: "money" }],
        rows: list.map((r) => [r.number, r.date, r.who, r.direction, r.of, methodLabel(r.method), r.reference, r.reason, r.amount]),
        note: cutNote(list.length, p),
      },
    ],
  };
}

async function debitRegister(p: ReportParams): Promise<Report> {
  const list = await rows<{ number: string; date: string; bill: string; billId: number; name: string; reason: string; net: number; vat: number; gross: number }>(sql`
    SELECT d.number, d.issue_date::text AS date, b.number AS bill, b.id AS "billId", coalesce(s.name, b.paid_to) AS name, d.reason, d.subtotal::float AS net, d.vat_amount::float AS vat, d.total::float AS gross
    FROM debit_notes d JOIN bills b ON b.id = d.bill_id LEFT JOIN suppliers s ON s.id = b.supplier_id
    WHERE d.issue_date BETWEEN ${p.from} AND ${p.to} ORDER BY d.issue_date, d.id LIMIT ${cap(p)}`);
  const links: Record<number, string> = {};
  list.forEach((r, i) => (links[i] = `/accounts/bills/${r.billId}`));
  return {
    title: "Debit note register",
    period: p.label,
    landscape: true,
    kpis: [
      { label: "Debit notes", value: list.length, kind: "int" },
      { label: "Before VAT", value: total(list.map((r) => r.net)), kind: "money" },
      { label: "VAT", value: total(list.map((r) => r.vat)), kind: "money" },
      { label: "With VAT", value: total(list.map((r) => r.gross)), kind: "money" },
    ],
    tables: [
      {
        title: "Debit notes issued",
        columns: [{ label: "Debit note" }, { label: "Date", kind: "date" }, { label: "Bill" }, { label: "Supplier" }, { label: "Reason" }, { label: "Before VAT", kind: "money" }, { label: "VAT", kind: "money" }, { label: "Total", kind: "money" }],
        rows: list.map((r) => [r.number, r.date, r.bill, r.name, r.reason, r.net, r.vat, r.gross]),
        links,
        total: ["Total", null, null, null, null, total(list.map((r) => r.net)), total(list.map((r) => r.vat)), total(list.map((r) => r.gross))],
        note: cutNote(list.length, p),
      },
    ],
  };
}

async function receiptRegister(p: ReportParams): Promise<Report> {
  const list = await rows<{ id: number; number: string; date: string; name: string; invoice: string | null; method: string; ref: string; amount: number; voided: boolean }>(sql`
    SELECT x.id, x.number, x.paid_on::text AS date, c.name, x.method, x.reference AS ref, x.amount::float AS amount, x.voided_at IS NOT NULL AS voided,
      (SELECT string_agg(i.number, ', ' ORDER BY a.id) FROM payment_allocations a JOIN invoices i ON i.id = a.invoice_id WHERE a.payment_id = x.id AND (a.voided_at IS NULL OR a.voided_at = x.voided_at)) AS invoice
    FROM payments x JOIN companies c ON c.id = x.company_id
    WHERE x.paid_on BETWEEN ${p.from} AND ${p.to} ORDER BY x.paid_on, x.id LIMIT ${cap(p)}`);
  const live = list.filter((r) => !r.voided);
  const links: Record<number, string> = {};
  list.forEach((r, i) => (links[i] = `/print/receipt/${r.id}`));
  return {
    title: "Payments received",
    period: p.label,
    landscape: true,
    kpis: [
      { label: "Received", value: total(live.map((r) => r.amount)), kind: "money" },
      { label: "Cash", value: total(live.filter((r) => r.method === "cash").map((r) => r.amount)), kind: "money" },
      { label: "Bank", value: total(live.filter((r) => r.method !== "cash").map((r) => r.amount)), kind: "money" },
      { label: "Voided", value: list.length - live.length, kind: "int" },
    ],
    tables: [
      {
        title: "Receipts",
        columns: [{ label: "Receipt" }, { label: "Date", kind: "date" }, { label: "Customer" }, { label: "Invoice" }, { label: "Paid by" }, { label: "Reference" }, { label: "Amount", kind: "money" }],
        rows: list.map((r) => [r.voided ? `${r.number} (voided)` : r.number, r.date, r.name, r.invoice ?? "Advance", methodLabel(r.method), r.ref, r.voided ? null : r.amount]),
        links,
        total: ["Total", null, null, null, null, null, total(live.map((r) => r.amount))],
        note: cutNote(list.length, p),
      },
    ],
  };
}

async function billRegister(p: ReportParams): Promise<Report> {
  const list = await rows<{ id: number; number: string; date: string; name: string; ref: string; category: string; kind: string; net: number; vat: number; gross: number; status: string }>(sql`
    SELECT b.id, b.number, b.bill_date::text AS date, coalesce(s.name, b.paid_to) AS name, b.supplier_ref AS ref, b.category, b.kind, b.subtotal::float AS net, b.vat_amount::float AS vat, b.total::float AS gross, b.status
    FROM bills b LEFT JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.bill_date BETWEEN ${p.from} AND ${p.to} ORDER BY b.bill_date, b.id LIMIT ${cap(p)}`);
  const live = list.filter((r) => r.status !== "void");
  const links: Record<number, string> = {};
  list.forEach((r, i) => (links[i] = `/accounts/bills/${r.id}`));
  const kinds: Record<string, string> = { bill: "Bill", expense: "Expense", opening: "Opening from Zoho" };
  return {
    title: "Bill register",
    period: p.label,
    landscape: true,
    kpis: [
      { label: "Documents", value: live.length, kind: "int" },
      { label: "Before VAT", value: total(live.map((r) => r.net)), kind: "money" },
      { label: "VAT", value: total(live.map((r) => r.vat)), kind: "money" },
      { label: "With VAT", value: total(live.map((r) => r.gross)), kind: "money" },
    ],
    tables: [
      {
        title: "Bills and expenses",
        columns: [{ label: "Number" }, { label: "Date", kind: "date" }, { label: "Paid to" }, { label: "Their no." }, { label: "Category" }, { label: "Kind" }, { label: "Before VAT", kind: "money" }, { label: "VAT", kind: "money" }, { label: "Total", kind: "money" }],
        rows: list.map((r) => {
          const v = r.status === "void";
          return [v ? `${r.number} (void)` : r.number, r.date, r.name, r.ref, categoryLabel(r.category), kinds[r.kind] ?? r.kind, v ? null : r.net, v ? null : r.vat, v ? null : r.gross];
        }),
        links,
        total: ["Total", null, null, null, null, null, total(live.map((r) => r.net)), total(live.map((r) => r.vat)), total(live.map((r) => r.gross))],
        note: cutNote(list.length, p),
      },
    ],
  };
}

async function paymentsMade(p: ReportParams): Promise<Report> {
  const list = await rows<{ id: number; number: string; date: string; name: string; bill: string | null; method: string; ref: string; amount: number; voided: boolean }>(sql`
    SELECT x.id, x.number, x.paid_on::text AS date, coalesce(s.name, x.paid_to) AS name, x.method, x.reference AS ref, x.amount::float AS amount, x.voided_at IS NOT NULL AS voided,
      (SELECT string_agg(b.number, ', ' ORDER BY a.id) FROM supplier_payment_allocations a JOIN bills b ON b.id = a.bill_id WHERE a.payment_id = x.id AND (a.voided_at IS NULL OR a.voided_at = x.voided_at)) AS bill
    FROM supplier_payments x LEFT JOIN suppliers s ON s.id = x.supplier_id
    WHERE x.paid_on BETWEEN ${p.from} AND ${p.to} ORDER BY x.paid_on, x.id LIMIT ${cap(p)}`);
  const live = list.filter((r) => !r.voided);
  const links: Record<number, string> = {};
  list.forEach((r, i) => (links[i] = `/print/payment-voucher/${r.id}`));
  return {
    title: "Payments made",
    period: p.label,
    landscape: true,
    kpis: [
      { label: "Paid", value: total(live.map((r) => r.amount)), kind: "money" },
      { label: "Cash", value: total(live.filter((r) => r.method === "cash").map((r) => r.amount)), kind: "money" },
      { label: "Bank", value: total(live.filter((r) => r.method !== "cash").map((r) => r.amount)), kind: "money" },
      { label: "Voided", value: list.length - live.length, kind: "int" },
    ],
    tables: [
      {
        title: "Payment vouchers",
        columns: [{ label: "Voucher" }, { label: "Date", kind: "date" }, { label: "Paid to" }, { label: "Bill" }, { label: "Paid by" }, { label: "Reference" }, { label: "Amount", kind: "money" }],
        rows: list.map((r) => [r.voided ? `${r.number} (voided)` : r.number, r.date, r.name, r.bill ?? "Advance", methodLabel(r.method), r.ref, r.voided ? null : r.amount]),
        links,
        total: ["Total", null, null, null, null, null, total(live.map((r) => r.amount))],
        note: cutNote(list.length, p),
      },
    ],
  };
}

async function purchases(p: ReportParams): Promise<Report> {
  const live = sql`b.status <> 'void' AND b.kind IN ('bill', 'expense') AND b.bill_date BETWEEN ${p.from} AND ${p.to}`;
  const bySupplier = await rows<{ id: number | null; name: string; n: number; net: number; vat: number }>(sql`
    SELECT b.supplier_id AS id, coalesce(s.name, b.paid_to) AS name, count(*)::int AS n, sum(b.subtotal - b.credited_net)::float AS net, sum(b.vat_amount)::float AS vat
    FROM bills b LEFT JOIN suppliers s ON s.id = b.supplier_id WHERE ${live} GROUP BY 1, 2 ORDER BY net DESC`);
  const byCategory = await rows<{ category: string; n: number; net: number; vat: number }>(sql`
    SELECT b.category, count(*)::int AS n, sum(b.subtotal - b.credited_net)::float AS net, sum(b.vat_amount)::float AS vat
    FROM bills b WHERE ${live} GROUP BY 1 ORDER BY net DESC`);
  const links: Record<number, string> = {};
  bySupplier.forEach((r, i) => {
    if (r.id) links[i] = `/accounts/suppliers/${r.id}`;
  });
  const cols = (first: string) => [{ label: first }, { label: "Documents", kind: "int" as const }, { label: "Before VAT", kind: "money" as const }, { label: "VAT", kind: "money" as const }];
  return {
    title: "Purchases analysis",
    period: p.label,
    kpis: [
      { label: "Bought before VAT", value: total(byCategory.map((r) => r.net)), kind: "money" },
      { label: "VAT paid", value: total(byCategory.map((r) => r.vat)), kind: "money" },
      { label: "Suppliers", value: bySupplier.length, kind: "int" },
    ],
    tables: [
      { title: "By supplier", columns: cols("Supplier"), rows: bySupplier.map((r) => [r.name, r.n, r.net, r.vat]), links, total: ["Total", bySupplier.reduce((s, r) => s + r.n, 0), total(bySupplier.map((r) => r.net)), total(bySupplier.map((r) => r.vat))] },
      { title: "By category", columns: cols("Category"), rows: byCategory.map((r) => [categoryLabel(r.category), r.n, r.net, r.vat]), total: ["Total", byCategory.reduce((s, r) => s + r.n, 0), total(byCategory.map((r) => r.net)), total(byCategory.map((r) => r.vat))] },
    ],
  };
}

async function expensesByCategory(p: ReportParams): Promise<Report> {
  const data = await rows<{ category: string; month: string; net: number }>(sql`
    SELECT b.category, to_char(b.bill_date, 'YYYY-MM') AS month, sum(b.subtotal - b.credited_net)::float AS net
    FROM bills b WHERE b.status <> 'void' AND b.kind IN ('bill', 'expense') AND b.category NOT IN ('cogs', 'services') AND b.bill_date BETWEEN ${p.from} AND ${p.to}
    GROUP BY 1, 2`);
  const months = monthsBetween(p.from, p.to);
  const cats = [...new Set(data.map((r) => r.category))];
  const cell = (c: string, m: string) => data.find((r) => r.category === c && r.month === m)?.net ?? 0;
  const rowsOut = cats
    .map((c): Cell[] => [categoryLabel(c), ...months.map((m) => cell(c, m)), total(months.map((m) => cell(c, m)))])
    .sort((a, b) => Number(b[b.length - 1]) - Number(a[a.length - 1]));
  const all = total(data.map((r) => r.net));
  return {
    title: "Expenses by category",
    period: p.label,
    landscape: months.length > 4,
    kpis: [{ label: "Expenses before VAT", value: all, kind: "money" }, { label: "Categories", value: cats.length, kind: "int" }],
    tables: [
      {
        title: "Month by month",
        columns: [{ label: "Category" }, ...months.map((m) => ({ label: monthLabel(m), kind: "money" as const })), { label: "Total", kind: "money" }],
        rows: rowsOut,
        total: ["Total", ...months.map((m) => total(data.filter((r) => r.month === m).map((r) => r.net))), all],
        note: "Running costs only: goods and services bought for sale are in the profit reports.",
      },
    ],
  };
}

async function projectProfit(p: ReportParams): Promise<Report> {
  const list = await rows<{ id: number; number: string; title: string; sales: number; costs: number }>(sql`
    SELECT pr.id, pr.number, d.title,
      (coalesce((SELECT sum(i.subtotal) FROM invoices i WHERE i.deal_id = pr.deal_id AND i.kind = 'sale' AND i.issue_date BETWEEN ${p.from} AND ${p.to}), 0)
        - coalesce((SELECT sum(c.subtotal) FROM credit_notes c JOIN invoices i ON i.id = c.invoice_id WHERE i.deal_id = pr.deal_id AND c.issue_date BETWEEN ${p.from} AND ${p.to}), 0))::float AS sales,
      coalesce((SELECT sum(b.subtotal - b.credited_net) FROM bills b WHERE b.deal_id = pr.deal_id AND b.status <> 'void' AND b.kind IN ('bill', 'expense') AND b.bill_date BETWEEN ${p.from} AND ${p.to}), 0)::float AS costs
    FROM projects pr JOIN deals d ON d.id = pr.deal_id
    ORDER BY pr.number`);
  const shown = list.filter((r) => r.sales || r.costs);
  const links: Record<number, string> = {};
  shown.forEach((r, i) => (links[i] = `/projects/list/${r.id}`));
  const sales = total(shown.map((r) => r.sales));
  const costs = total(shown.map((r) => r.costs));
  return {
    title: "Profit per project",
    period: p.label,
    kpis: [
      { label: "Project sales", value: sales, kind: "money" },
      { label: "Project costs", value: costs, kind: "money" },
      { label: "Profit", value: total([sales, -costs]), kind: "money" },
    ],
    tables: [
      {
        title: "Projects",
        columns: [{ label: "Project" }, { label: "Name" }, { label: "Sales", kind: "money" }, { label: "Costs", kind: "money" }, { label: "Profit", kind: "money" }],
        rows: shown.map((r) => [r.number, r.title, r.sales, r.costs, total([r.sales, -r.costs])]),
        links,
        total: ["Total", null, sales, costs, total([sales, -costs])],
        note: "Sales less credit notes, and bills and expenses on the project's deal, all before VAT, dated in this period.",
      },
    ],
  };
}

async function soldWithoutCost(p: ReportParams): Promise<Report> {
  const list = await rows<{ id: number; number: string; date: string; name: string; order: string; net: number; estimate: number | null }>(sql`
    SELECT i.id, i.number, i.issue_date::text AS date, i.customer_name AS name, coalesce(o.number, '') AS "order", i.subtotal::float AS net, o.cost_total::float AS estimate
    FROM invoices i LEFT JOIN sales_orders o ON o.id = i.order_id
    WHERE i.kind = 'sale' AND i.status = 'issued' AND i.issue_date BETWEEN ${p.from} AND ${p.to}
      AND NOT EXISTS (SELECT 1 FROM bills b WHERE (b.invoice_id = i.id OR (i.order_id IS NOT NULL AND b.order_id = i.order_id)) AND b.status <> 'void' AND b.category IN ('cogs', 'services'))
    ORDER BY i.issue_date, i.id LIMIT ${cap(p)}`);
  const links: Record<number, string> = {};
  list.forEach((r, i) => (links[i] = `/accounts/invoices/${r.id}`));
  return {
    title: "Sold without a cost",
    period: p.label,
    kpis: [
      { label: "Invoices", value: list.length, kind: "int" },
      { label: "Sold before VAT", value: total(list.map((r) => r.net)), kind: "money" },
      { label: "Cost estimated on the quote", value: total(list.map((r) => r.estimate)), kind: "money" },
    ],
    tables: [
      {
        title: "Invoices with no supplier bill",
        columns: [{ label: "Invoice" }, { label: "Date", kind: "date" }, { label: "Customer" }, { label: "Order" }, { label: "Sold", kind: "money" }, { label: "Estimated cost", kind: "money" }],
        rows: list.map((r) => [r.number, r.date, r.name, r.order, r.net, r.estimate]),
        links,
        total: ["Total", null, null, null, total(list.map((r) => r.net)), total(list.map((r) => r.estimate))],
        note: "Profit looks too high until the bill arrives. Record the bill, or at month end post an accrual journal for the estimated cost and reverse it next month.",
      },
    ],
  };
}

async function auditTrail(p: ReportParams): Promise<Report> {
  const orgId = await currentOrgId();
  const list = await rows<{ at: string; who: string | null; action: string; summary: string; ip: string }>(sql`
    SELECT to_char(a.at AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD HH24:MI') AS at, u.name AS who, a.action, a.summary, a.ip
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.organization_id = ${orgId} AND (a.at AT TIME ZONE 'Asia/Dubai')::date BETWEEN ${p.from} AND ${p.to}
    ORDER BY a.at DESC LIMIT ${cap(p)}`);
  return {
    title: "Audit trail",
    period: p.label,
    landscape: true,
    kpis: [
      { label: "Actions", value: list.length, kind: "int" },
      { label: "People", value: new Set(list.map((r) => r.who)).size, kind: "int" },
    ],
    tables: [
      {
        title: "Who did what",
        columns: [{ label: "When" }, { label: "Who" }, { label: "Action" }, { label: "What happened" }, { label: "From" }],
        rows: list.map((r) => [r.at, r.who ?? "(system)", r.action, r.summary, r.ip]),
        note: cutNote(list.length, p),
      },
    ],
  };
}

async function voidedDocs(p: ReportParams): Promise<Report> {
  const list = await rows<{ at: string; kind: string; number: string; amount: number; reason: string; href: string }>(sql`
    SELECT * FROM (
      SELECT to_char(x.voided_at AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD') AS at, 'Payment received' AS kind, x.number, x.amount::float AS amount, x.void_reason AS reason, '/print/receipt/' || x.id AS href
        FROM payments x WHERE x.voided_at IS NOT NULL
      UNION ALL
      SELECT to_char(x.voided_at AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD'), 'Payment made', x.number, x.amount::float, x.void_reason, '/print/payment-voucher/' || x.id
        FROM supplier_payments x WHERE x.voided_at IS NOT NULL
      UNION ALL
      SELECT to_char(b.voided_at AT TIME ZONE 'Asia/Dubai', 'YYYY-MM-DD'), CASE b.kind WHEN 'expense' THEN 'Expense' ELSE 'Bill' END, b.number, b.total::float, b.void_reason, '/accounts/bills/' || b.id
        FROM bills b WHERE b.status = 'void' AND b.voided_at IS NOT NULL
      UNION ALL
      SELECT c.issue_date::text, 'Invoice cancelled', i.number, i.total::float, c.reason, '/accounts/invoices/' || i.id
        FROM credit_notes c JOIN invoices i ON i.id = c.invoice_id
    ) v WHERE v.at BETWEEN ${p.from} AND ${p.to} ORDER BY v.at DESC LIMIT ${cap(p)}`);
  const links: Record<number, string> = {};
  list.forEach((r, i) => (links[i] = r.href));
  return {
    title: "Voided and cancelled",
    period: p.label,
    landscape: true,
    kpis: [
      { label: "Documents", value: list.length, kind: "int" },
      { label: "Their value", value: total(list.map((r) => r.amount)), kind: "money" },
    ],
    tables: [
      {
        title: "Taken back",
        columns: [{ label: "When", kind: "date" }, { label: "What" }, { label: "Number" }, { label: "Reason" }, { label: "Amount", kind: "money" }],
        rows: list.map((r) => [r.at, r.kind, r.number, r.reason, r.amount]),
        links,
        total: ["Total", null, null, null, total(list.map((r) => r.amount))],
        note: cutNote(list.length, p),
      },
    ],
  };
}

const RUNNERS: Record<string, (p: ReportParams) => Promise<Report>> = {
  "aged-ar": agedReceivables,
  "aged-ap": agedPayables,
  "customer-statement": customerStatement,
  "supplier-statement": supplierStatement,
  invoices: invoiceRegister,
  "credit-notes": creditRegister,
  "debit-notes": debitRegister,
  refunds: refundRegister,
  "vat-return": vatReturnReport,
  "vat-check": vatCheckReport,
  receipts: receiptRegister,
  bills: billRegister,
  "payments-made": paymentsMade,
  purchases,
  expenses: expensesByCategory,
  "project-profit": projectProfit,
  uninvoiced: soldWithoutCost,
  audit: auditTrail,
  voided: voidedDocs,
};

export const registerRunner = (key: string) => RUNNERS[key];
