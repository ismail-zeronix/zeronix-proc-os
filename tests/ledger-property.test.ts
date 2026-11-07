import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { journalProblem, journalTotals } from "@/lib/ledger/journal";
import { advanceAppliedLines, advanceReturnedLines, billLines, closingStockLines, cogsLines, creditNoteLines, debitNoteLines, expenseLines, groupSaleParts, invoiceLines, receiptLines, supplierAdvanceAppliedLines, supplierAdvanceReturnedLines, supplierPaymentLines } from "@/lib/ledger/rules";
import { fromMinor } from "@/lib/money";

/** Whole fils, so nothing here depends on how decimals round. */
const fils = (max = 100_000_000) => fc.integer({ min: 1, max }).map(fromMinor);

const invoice = fc
  .record({ net: fc.integer({ min: 1, max: 100_000_000 }), servicePart: fc.double({ min: 0, max: 1, noNaN: true }), vat: fc.integer({ min: 0, max: 5_000_000 }) })
  .map(({ net, servicePart, vat }) => ({
    companyId: 7,
    orderId: null,
    dealId: null,
    number: "I",
    parts: groupSaleParts([
      { lineKind: "product" as const, code: vat > 0 ? "SR" : "ZR", net: fromMinor(net - Math.floor(net * servicePart)) },
      { lineKind: "service" as const, code: vat > 0 ? "SR" : "ZR", net: fromMinor(Math.floor(net * servicePart)) },
    ]),
    vatAmount: fromMinor(vat),
    total: fromMinor(net + vat),
  }));

const bill = fc.record({ net: fc.integer({ min: 1, max: 100_000_000 }), vat: fc.integer({ min: 0, max: 5_000_000 }), category: fc.constantFrom("cogs", "services", "rent", "transport") }).map(({ net, vat, category }) => ({
  number: "B",
  supplierId: 4,
  category,
  orderId: null,
  dealId: null,
  parts: [{ code: vat > 0 ? "SR" : "OS", net: fromMinor(net), selfAssessed: 0 }],
  vatAmount: fromMinor(vat),
  total: fromMinor(net + vat),
}));

/** A payment split into parts, with whatever is left as an advance. */
const split = fc.array(fc.integer({ min: 1, max: 10_000_000 }), { maxLength: 8 }).chain((parts) => {
  const used = parts.reduce((s, p) => s + p, 0);
  return fc.integer({ min: 0, max: 10_000_000 }).filter((extra) => used + extra > 0).map((extra) => ({ amount: fromMinor(used + extra), parts: parts.map(fromMinor), extra: fromMinor(extra) }));
});

describe("every posting balances, whatever the amounts", () => {
  it("invoices and credit notes, in any split of products and services", () => {
    fc.assert(
      fc.property(invoice, (i) => {
        const inv = invoiceLines(i);
        expect(journalProblem(inv)).toBeNull();
        expect(journalTotals(inv).debit).toBe(i.total);
        const cn = creditNoteLines({ ...i, creditNumber: "C" });
        expect(journalProblem(cn)).toBeNull();
        expect(journalTotals(cn).debit).toBe(i.total);
      }),
    );
  });

  it("bills and expenses", () => {
    fc.assert(
      fc.property(bill, (b) => {
        expect(journalProblem(billLines(b))).toBeNull();
        expect(journalProblem(expenseLines({ ...b, bankLedgerAccountId: 9 }))).toBeNull();
      }),
    );
  });

  it("bills with reverse charge, and debit notes split between stock and cost of goods sold", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000_000 }), fc.integer({ min: 1, max: 100_000_000 }), fc.integer({ min: 0, max: 200_000_000 }), fc.constantFrom("cogs", "services", "rent"), (sr, rc, stock, category) => {
        const vat = Math.round(sr * 0.05);
        const self = Math.round(rc * 0.05);
        const parts = [
          { code: "SR", net: fromMinor(sr), selfAssessed: 0 },
          { code: "RC", net: fromMinor(rc), selfAssessed: fromMinor(self) },
        ];
        const facts = { number: "B", supplierId: 4, category, orderId: null, dealId: null, parts, vatAmount: fromMinor(vat), total: fromMinor(sr + rc + vat) };
        expect(journalProblem(billLines(facts))).toBeNull();
        expect(journalProblem(expenseLines({ ...facts, bankLedgerAccountId: 9 }))).toBeNull();
        expect(journalProblem(debitNoteLines({ ...facts, billNumber: "B", inStock: fromMinor(stock) }))).toBeNull();
      }),
    );
  });

  it("receipts and vouchers across any documents: the advance is exactly what is left", () => {
    fc.assert(
      fc.property(split, ({ amount, parts, extra }) => {
        const r = receiptLines({ bankLedgerAccountId: 9, amount, companyId: 7, number: "R", allocations: parts.map((p, i) => ({ amount: p, invoiceNumber: `I${i}` })) });
        expect(journalProblem(r)).toBeNull();
        expect(r.find((l) => l.account === "customer_advances")?.credit ?? 0).toBe(extra);
        const v = supplierPaymentLines({ bankLedgerAccountId: 9, amount, supplierId: 4, number: "V", allocations: parts.map((p, i) => ({ amount: p, billNumber: `B${i}` })) });
        expect(journalProblem(v)).toBeNull();
        expect(v.find((l) => l.account === "supplier_advances")?.debit ?? 0).toBe(extra);
      }),
    );
  });

  it("applying an advance and taking it back cancel out", () => {
    fc.assert(
      fc.property(fils(), (amount) => {
        const c = { amount, companyId: 7, paymentNumber: "R", invoiceNumber: "I" };
        const s = { amount, supplierId: 4, paymentNumber: "V", billNumber: "B" };
        for (const [on, off] of [[advanceAppliedLines(c), advanceReturnedLines(c)], [supplierAdvanceAppliedLines(s), supplierAdvanceReturnedLines(s)]]) {
          expect(journalProblem(on)).toBeNull();
          expect(journalProblem(off)).toBeNull();
          const net = new Map<string, number>();
          for (const l of [...on, ...off]) net.set(String(l.account), Math.round(((net.get(String(l.account)) ?? 0) + (l.debit ?? 0) - (l.credit ?? 0)) * 100) / 100);
          expect([...net.values()].every((v) => v === 0)).toBe(true);
        }
      }),
    );
  });

  it("cost of goods and the stock count", () => {
    fc.assert(
      fc.property(fils(), fils(), (a, b) => {
        expect(journalProblem(cogsLines({ amount: a, billNumber: "B", invoiceNumber: "I", orderId: null, dealId: null }))).toBeNull();
        const stock = closingStockLines(a, b, "count");
        if (a === b) expect(stock).toBeNull();
        else expect(journalProblem(stock!)).toBeNull();
      }),
    );
  });
});
