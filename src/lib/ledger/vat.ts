import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { lineCost } from "@/lib/purchases";
import { lineTotal, round2 } from "@/lib/quotation";
import { fromMinor, toMinor } from "@/lib/money";
import type { Report } from "@/lib/reports";
import type { ReportParams } from "@/lib/report-centre";
import { buildFaf, splitVat, type FafLedgerLine, type FafPurchase, type FafSupply } from "@/lib/tax/faf";
import { buildVat201, type Vat201, type VatLedgerRow } from "@/lib/tax/vat201";
import { dubaiToday } from "@/lib/dates";
import { currentOrgId, orgProfile } from "@/lib/org";
import type { Tx } from "@/lib/tx";

type Reader = Pick<Tx, "execute">;

/** What the ledger holds per tax code in a period. Opening balances belong to Zoho's returns; a settlement moves VAT, it is not VAT. */
export async function vatLedgerRows(reader: Reader, orgId: number, from: string, to: string): Promise<VatLedgerRow[]> {
  const r = await reader.execute<{ code: string; type: string; key: string | null; base: number; credit: number }>(sql`
    SELECT t.code, a.type, a.system_key AS key, coalesce(sum(l.tax_base), 0)::float AS base, coalesce(sum(l.credit - l.debit), 0)::float AS credit
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN accounts a ON a.id = l.account_id
    JOIN tax_codes t ON t.id = l.tax_code_id
    WHERE e.organization_id = ${orgId} AND e.date BETWEEN ${from} AND ${to} AND e.source_type NOT IN ('opening', 'vat_settlement', 'vat_payment')
    GROUP BY 1, 2, 3`);
  return r.rows.map((x) => ({ code: x.code, accountType: x.type, systemKey: x.key, base: Number(x.base), credit: Number(x.credit) }));
}

/** VAT accounts moved by the period's entries: the return should come to the same, or something posted without a tax code. */
export async function vatInLedger(reader: Reader, orgId: number, from: string, to: string): Promise<number> {
  const r = await reader.execute<{ v: number }>(sql`
    SELECT coalesce(sum(l.credit - l.debit), 0)::float AS v
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE e.organization_id = ${orgId} AND e.date BETWEEN ${from} AND ${to} AND a.system_key IN ('vat_output', 'vat_output_rc', 'vat_input', 'vat_input_rc')
      AND e.source_type NOT IN ('opening', 'vat_settlement', 'vat_payment')`);
  return round2(Number(r.rows[0]?.v ?? 0));
}

export async function vatReturnFor(reader: Reader, orgId: number, from: string, to: string): Promise<{ boxes: Vat201; ledger: number; difference: number }> {
  const org = await orgProfile(orgId);
  const boxes = buildVat201(await vatLedgerRows(reader, orgId, from, to), org.emirate);
  const ledger = await vatInLedger(reader, orgId, from, to);
  return { boxes, ledger, difference: fromMinor(toMinor(ledger) - toMinor(boxes.payable)) };
}

/** Filed returns, newest first, with the ones that were undone left out. */
export async function filedReturns(orgId: number) {
  const v = schema.vatReturns;
  const rows = await db.select().from(v).where(eq(v.organizationId, orgId)).orderBy(desc(v.periodEnd), desc(v.id));
  return rows.filter((r) => !r.undoneAt);
}

/** Held for customers with no invoice yet: VAT can be due when the money arrives, which the accountant must judge. */
export async function advancesHeld(orgId: number): Promise<number> {
  const r = await db.execute<{ v: number }>(sql`
    SELECT coalesce(sum(l.credit - l.debit), 0)::float AS v FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.organization_id = ${orgId} AND a.system_key = 'customer_advances'`);
  return round2(Number(r.rows[0]?.v ?? 0));
}

// ---- reports

export async function vatReturnReport(p: ReportParams): Promise<Report> {
  const orgId = await currentOrgId();
  const { boxes, difference } = await vatReturnFor(db, orgId, p.from, p.to);
  return {
    title: "VAT return (VAT 201)",
    period: p.label,
    kpis: [
      { label: "VAT due", value: boxes.totalOutput, kind: "money" },
      { label: "Recoverable VAT", value: boxes.totalInput, kind: "money" },
      { label: boxes.payable >= 0 ? "Payable" : "Refundable", value: Math.abs(boxes.payable), kind: "money" },
    ],
    tables: [
      {
        title: "VAT 201",
        columns: [{ label: "Box" }, { label: "" }, { label: "Amount (AED)", kind: "money" }, { label: "VAT (AED)", kind: "money" }],
        rows: boxes.rows.map((r) => [r.box, r.label, r.amount, r.vat]),
        note: difference !== 0 ? `The VAT accounts differ from this return by ${difference.toFixed(2)}: a journal touched a VAT account without a tax code.` : "Worked out from the ledger, by tax code. Your accountant should check it before filing.",
      },
    ],
  };
}

interface Problem {
  check: string;
  number: string;
  date: string;
  who: string;
  amount: number;
  href: string;
}

const execRows = async <T extends Record<string, unknown>>(q: ReturnType<typeof sql>) => (await db.execute<T>(q)).rows;

/** What would make a document fail as a tax invoice, or its VAT unsafe to reclaim. */
export async function vatProblems(from: string, to: string): Promise<Problem[]> {
  type Doc = { id: number; number: string; date: string; who: string; amount: number; check: string };
  const inv = await execRows<Doc>(sql`
    SELECT x.id, x.number, x.date, x.who, x.amount, x.check FROM (
      SELECT i.id, i.number, i.issue_date::text AS date, i.customer_name AS who, i.total::float AS amount, 'No customer address on the invoice' AS check
        FROM invoices i WHERE i.kind = 'sale' AND i.status <> 'cancelled' AND i.issue_date BETWEEN ${from} AND ${to} AND trim(i.customer_address) = ''
      UNION ALL
      SELECT i.id, i.number, i.issue_date::text, i.customer_name, i.total::float, 'Customer TRN is not 15 digits'
        FROM invoices i WHERE i.kind = 'sale' AND i.status <> 'cancelled' AND i.issue_date BETWEEN ${from} AND ${to} AND trim(i.customer_trn) <> '' AND regexp_replace(i.customer_trn, '[\\s-]', '', 'g') !~ '^[0-9]{15}$'
      UNION ALL
      SELECT i.id, i.number, i.issue_date::text, i.customer_name, i.total::float, 'VAT is not 5% of the standard-rated lines'
        FROM invoices i
        WHERE i.kind = 'sale' AND i.status <> 'cancelled' AND i.issue_date BETWEEN ${from} AND ${to}
          AND abs(i.vat_amount - round(coalesce((SELECT sum(round(it.qty * it.unit_price, 2)) FROM invoice_items it WHERE it.invoice_id = i.id AND it.tax_code = 'SR'), 0) * 0.05, 2)) > 0.05
      UNION ALL
      SELECT i.id, i.number, i.issue_date::text, i.customer_name, i.total::float, 'Zero-rated line for a customer in the UAE'
        FROM invoices i JOIN companies c ON c.id = i.company_id
        WHERE i.kind = 'sale' AND i.status <> 'cancelled' AND i.issue_date BETWEEN ${from} AND ${to} AND c.emirate <> '' AND c.emirate <> 'Outside UAE'
          AND EXISTS (SELECT 1 FROM invoice_items it WHERE it.invoice_id = i.id AND it.tax_code = 'ZR')
    ) x ORDER BY x.date, x.number`);
  const bills = await execRows<Doc>(sql`
    SELECT x.id, x.number, x.date, x.who, x.amount, x.check FROM (
      SELECT b.id, b.number, b.bill_date::text AS date, coalesce(s.name, b.paid_to) AS who, b.vat_amount::float AS amount, 'VAT reclaimed with no supplier TRN' AS check
        FROM bills b LEFT JOIN suppliers s ON s.id = b.supplier_id
        WHERE b.status <> 'void' AND b.kind <> 'opening' AND b.bill_date BETWEEN ${from} AND ${to} AND b.vat_amount > 0 AND coalesce(trim(s.trn), '') = ''
      UNION ALL
      SELECT b.id, b.number, b.bill_date::text, coalesce(s.name, b.paid_to), b.vat_amount::float, 'VAT reclaimed with no supplier invoice number'
        FROM bills b LEFT JOIN suppliers s ON s.id = b.supplier_id
        WHERE b.status <> 'void' AND b.kind = 'bill' AND b.bill_date BETWEEN ${from} AND ${to} AND b.vat_amount > 0 AND trim(b.supplier_ref) = ''
      UNION ALL
      SELECT b.id, b.number, b.bill_date::text, coalesce(s.name, b.paid_to), b.total::float, 'Reverse charge on a supplier with a UAE TRN'
        FROM bills b JOIN suppliers s ON s.id = b.supplier_id
        WHERE b.status <> 'void' AND b.bill_date BETWEEN ${from} AND ${to} AND trim(s.trn) <> ''
          AND EXISTS (SELECT 1 FROM bill_items it WHERE it.bill_id = b.id AND it.tax_code = 'RC')
    ) x ORDER BY x.date, x.number`);
  const late = await execRows<Doc>(sql`
    SELECT i.id, n.number, n.issue_date::text AS date, i.customer_name AS who, n.total::float AS amount, 'Credit note issued more than 14 days after the return' AS check
    FROM credit_notes n JOIN invoices i ON i.id = n.invoice_id
    WHERE n.issue_date BETWEEN ${from} AND ${to} AND n.event_date IS NOT NULL AND n.issue_date - n.event_date > 14 ORDER BY n.issue_date, n.number`);
  return [
    ...late.map((d) => ({ check: d.check, number: d.number, date: d.date, who: d.who, amount: Number(d.amount), href: `/accounts/invoices/${d.id}` })),
    ...inv.map((d) => ({ check: d.check, number: d.number, date: d.date, who: d.who, amount: Number(d.amount), href: `/accounts/invoices/${d.id}` })),
    ...bills.map((d) => ({ check: d.check, number: d.number, date: d.date, who: d.who, amount: Number(d.amount), href: `/accounts/bills/${d.id}` })),
  ];
}

export async function vatCheckReport(p: ReportParams): Promise<Report> {
  const [problems, trn] = await Promise.all([vatProblems(p.from, p.to), orgProfile(await currentOrgId()).then((o) => o.taxRegNo)]);
  const links: Record<number, string> = {};
  problems.forEach((x, i) => (links[i] = x.href));
  return {
    title: "Tax invoice checks",
    period: p.label,
    landscape: true,
    kpis: [
      { label: "To look at", value: problems.length, kind: "int" },
      { label: "Invoices", value: problems.filter((x) => x.href.includes("/invoices/")).length, kind: "int" },
      { label: "Bills and expenses", value: problems.filter((x) => x.href.includes("/bills/")).length, kind: "int" },
    ],
    tables: [
      {
        title: "Documents to look at",
        columns: [{ label: "Check" }, { label: "Number" }, { label: "Date", kind: "date" }, { label: "Customer or supplier" }, { label: "Amount", kind: "money" }],
        rows: problems.map((x) => [x.check, x.number, x.date, x.who, x.amount]),
        links,
        note: trn ? "Nothing here stops a filing. Each line is something the FTA could question." : "Our own TRN is not set: Accounts › Settings › VAT registration.",
      },
    ],
  };
}

// ---- FTA Audit File

const toCountry = (emirate: string) => (emirate === "Outside UAE" ? "OUTSIDE UAE" : "AE");

/** Everything the audit file carries for a period, as CSV. */
export async function fafFile(orgId: number, from: string, to: string): Promise<string> {
  const org = await orgProfile(orgId);
  const purchaseLines = await execRows<{ who: string | null; trn: string | null; date: string; ref: string; number: string; line: number; description: string; qty: number; cost: number; code: string; vat: number; sign: number }>(sql`
    SELECT coalesce(s.name, b.paid_to) AS who, s.trn, b.bill_date::text AS date, b.supplier_ref AS ref, b.number, it.position AS line, it.description, it.qty::float AS qty, it.unit_cost::float AS cost, it.tax_code AS code, b.vat_amount::float AS vat, 1 AS sign
    FROM bill_items it JOIN bills b ON b.id = it.bill_id LEFT JOIN suppliers s ON s.id = b.supplier_id
    WHERE b.status <> 'void' AND b.kind <> 'opening' AND b.bill_date BETWEEN ${from} AND ${to}
    UNION ALL
    SELECT coalesce(s.name, b.paid_to), s.trn, d.issue_date::text, d.supplier_ref, d.number, it.position, it.description, it.qty::float, it.unit_cost::float, it.tax_code, d.vat_amount::float, -1
    FROM debit_note_items it JOIN debit_notes d ON d.id = it.debit_note_id JOIN bills b ON b.id = d.bill_id LEFT JOIN suppliers s ON s.id = b.supplier_id
    WHERE d.issue_date BETWEEN ${from} AND ${to}
    ORDER BY 3, 5, 6`);
  const supplyLines = await execRows<{ who: string; trn: string; emirate: string; date: string; number: string; line: number; description: string; qty: number; price: number; code: string; vat: number; sign: number }>(sql`
    SELECT i.customer_name AS who, i.customer_trn AS trn, c.emirate, i.issue_date::text AS date, i.number, it.position AS line, it.description, it.qty::float AS qty, it.unit_price::float AS price, it.tax_code AS code, i.vat_amount::float AS vat, 1 AS sign
    FROM invoice_items it JOIN invoices i ON i.id = it.invoice_id JOIN companies c ON c.id = i.company_id
    WHERE i.kind = 'sale' AND i.issue_date BETWEEN ${from} AND ${to}
    UNION ALL
    SELECT i.customer_name, i.customer_trn, co.emirate, n.issue_date::text, n.number, it.position, it.description, it.qty::float, it.unit_price::float, it.tax_code, n.vat_amount::float, -1
    FROM credit_note_items it JOIN credit_notes n ON n.id = it.credit_note_id JOIN invoices i ON i.id = n.invoice_id JOIN companies co ON co.id = i.company_id
    WHERE i.kind = 'sale' AND n.issue_date BETWEEN ${from} AND ${to}
    ORDER BY 4, 5, 6`);

  const purchaseVat = splitVat(purchaseLines.map((r) => ({ doc: r.number, code: r.code, net: lineCost({ qty: r.qty, unitCost: r.cost }), vat: r.vat })));
  const purchases: FafPurchase[] = purchaseLines.map((r, i) => ({
    supplier: r.who ?? "",
    country: "AE",
    trn: r.trn ?? "",
    invoiceDate: r.date,
    invoiceNo: r.ref || r.number,
    permitNo: "",
    transactionId: r.number,
    lineNo: Number(r.line) + 1,
    description: r.description,
    value: Number(r.sign) * lineCost({ qty: r.qty, unitCost: r.cost }),
    vat: Number(r.sign) * purchaseVat[i],
    taxCode: r.code,
  }));
  const supplyVat = splitVat(supplyLines.map((r) => ({ doc: r.number, code: r.code, net: lineTotal({ qty: r.qty, unitPrice: r.price }), vat: r.vat })));
  const supplies: FafSupply[] = supplyLines.map((r, i) => ({
    customer: r.who,
    country: toCountry(r.emirate),
    trn: r.trn,
    invoiceDate: r.date,
    invoiceNo: r.number,
    transactionId: r.number,
    lineNo: Number(r.line) + 1,
    description: r.description,
    value: Number(r.sign) * lineTotal({ qty: r.qty, unitPrice: r.price }),
    vat: Number(r.sign) * supplyVat[i],
    taxCode: r.code,
  }));

  const before = await execRows<{ id: number; v: number }>(sql`
    SELECT l.account_id AS id, coalesce(sum(l.debit - l.credit), 0)::float AS v FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
    WHERE e.organization_id = ${orgId} AND e.date < ${from} GROUP BY 1`);
  const running = new Map(before.map((b) => [Number(b.id), toMinor(Number(b.v))]));
  const glRows = await execRows<{ date: string; id: number; code: string; name: string; memo: string; line: string; number: string; sid: number | null; stype: string; debit: number; credit: number }>(sql`
    SELECT e.date::text AS date, a.id, a.code, a.name, e.memo, l.description AS line, e.number, e.source_id AS sid, e.source_type AS stype, l.debit::float AS debit, l.credit::float AS credit
    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
    WHERE e.organization_id = ${orgId} AND e.date BETWEEN ${from} AND ${to}
    ORDER BY a.code, e.date, e.id, l.id`);
  const ledger: FafLedgerLine[] = glRows.map((r) => {
    const id = Number(r.id);
    const bal = (running.get(id) ?? 0) + toMinor(Number(r.debit)) - toMinor(Number(r.credit));
    running.set(id, bal);
    return { date: r.date, accountId: r.code, accountName: r.name, description: r.memo, name: r.line, transactionId: r.number, sourceId: r.sid == null ? "" : String(r.sid), sourceType: r.stype, debit: Number(r.debit), credit: Number(r.credit), balance: fromMinor(bal) };
  });

  return buildFaf(
    { nameEn: org.legalName, nameAr: "", trn: org.taxRegNo, agencyName: "", tan: "", agentName: "", taan: "", from, to, created: dubaiToday(), product: "Zeronix OS" },
    purchases,
    supplies,
    ledger,
  );
}

