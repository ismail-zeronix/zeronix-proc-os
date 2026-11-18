import { describe, expect, it } from "vitest";
import { guessColumns, missingFields } from "@/lib/import/columns";
import { BILL_FIELDS, buildDrafts, checkDoc, finalizeDoc, guessCategory, INVOICE_FIELDS, type DraftDoc } from "@/lib/import/docs";
import { parseCsv } from "@/lib/prospecting/import";
import { docTax, netFromGross, netsFromGross } from "@/lib/tax/doc-tax";

const ZOHO = [
  "Invoice Date,Invoice Number,Customer Name,Subject,Customer ID,Is Inclusive Tax,Currency Code,SubTotal,Total,Balance,Expected Payment Date,Last Payment Date,Invoice Type,Item Name,Item Desc,Item Total,Item Tax %,Item Tax Amount,Quantity,Partial Payments,Billing Address,Sales person,PurchaseOrder",
  '2026-11-05,INV-ZRNX0117454,AL WDOH LLC,,1,false,AED,34520.00,36246.00,0.00,,2026-11-10,Invoice,,"HP ProOne\nSN : 1",28920.00,5.00,1446.00,8.00,false,"Dubai Media City, Tower 24",MOHAMMED ABBAS,',
  "2026-11-05,INV-ZRNX0117454,AL WDOH LLC,,1,false,AED,34520.00,36246.00,0.00,,2026-11-10,Invoice,,Poly Headset,5600.00,5.00,280.00,8.00,false,\"Dubai Media City, Tower 24\",MOHAMMED ABBAS,",
  "2026-11-03,INV-ZRNX0117450,CASH CUSTOMER,JOSEPH,2,false,AED,5300.00,5300.00,5300.00,,,Invoice,,HP Victus,5300.00,0.00,0.00,2.00,false,,EISA KHAN,",
].join("\n");

const load = (text: string, fields = INVOICE_FIELDS) => {
  const rows = parseCsv(text);
  const map = guessColumns(rows[0], fields);
  return { map, rows: rows.slice(1) };
};

describe("pasted columns", () => {
  it("recognises a Zoho invoice export", () => {
    const { map } = load(ZOHO);
    expect(missingFields(INVOICE_FIELDS, map)).toEqual([]);
    const h = parseCsv(ZOHO)[0];
    const name = (k: string) => h[map[k]!];
    expect(name("number")).toBe("Invoice Number");
    expect(name("date")).toBe("Invoice Date");
    expect(name("party")).toBe("Customer Name");
    expect(name("description")).toBe("Item Desc");
    expect(name("lineTotal")).toBe("Item Total");
    expect(name("total")).toBe("Total");
    expect(name("taxPct")).toBe("Item Tax %");
    expect(name("paidDate")).toBe("Last Payment Date");
    expect(name("balance")).toBe("Balance");
    expect(name("ref")).toBe("PurchaseOrder");
  });

  it("reads a tab-separated paste (copied from Excel)", () => {
    const rows = parseCsv("Invoice No\tDate\tCustomer\tDescription\tQty\tRate\nINV-1\t2026-11-02\tACME LLC\tLaptop\t2\t3000\n\n");
    expect(rows).toHaveLength(2);
    const map = guessColumns(rows[0], INVOICE_FIELDS);
    expect(missingFields(INVOICE_FIELDS, map)).toEqual([]);
    const { docs } = buildDrafts("invoice", rows.slice(1), map);
    expect(docs[0]).toMatchObject({ number: "INV-1", date: "2026-11-02", party: "ACME LLC" });
    expect(docs[0].lines[0]).toMatchObject({ qty: 2, price: 3000, taxCode: "SR" });
  });

  it("says which required column is missing", () => {
    const map = guessColumns(["Foo", "Bar"], INVOICE_FIELDS);
    expect(missingFields(INVOICE_FIELDS, map).map((f) => f.key)).toEqual(["number", "date", "party", "description", "qty"]);
  });

  it("recognises a bill export", () => {
    const rows = parseCsv("Bill Date,Bill Number,Vendor Name,Account,Description,Quantity,Rate,Tax %\n2026-11-04,B-77,ALTWFEEQ,Cost of Goods Sold,Lenovo E14,3,2000,5");
    const map = guessColumns(rows[0], BILL_FIELDS);
    expect(missingFields(BILL_FIELDS, map)).toEqual([]);
    const { docs } = buildDrafts("bill", rows.slice(1), map);
    expect(docs[0]).toMatchObject({ number: "B-77", party: "ALTWFEEQ", category: "cogs" });
  });
});

describe("rows into documents", () => {
  it("groups lines by invoice number and reads the paid part", () => {
    const { map, rows } = load(ZOHO);
    const { docs, skipped } = buildDrafts("invoice", rows, map);
    expect(skipped).toBe(0);
    expect(docs).toHaveLength(2);
    const [a, b] = docs;
    expect(a.number).toBe("INV-ZRNX0117454");
    expect(a.lines).toHaveLength(2);
    expect(a.lines[0]).toMatchObject({ qty: 8, price: 3615, taxCode: "SR" });
    expect(a.lines[0].description).toBe("HP ProOne\nSN : 1");
    expect(a.address).toBe("Dubai Media City, Tower 24");
    expect(a.csvTotal).toBe(36246);
    expect(a.paid).toMatchObject({ on: true, amount: 36246, date: "2026-11-10", method: "bank" });
    expect(a.termsDays).toBe(30);
    expect(b.lines[0].taxCode).toBe("ZR");
    expect(b.paid.on).toBe(false);
    expect(b.termsDays).toBe(0);
    expect(b.ref).toBe("JOSEPH");
  });

  it("gives every line the code its tax % says, and OS to a bill with no VAT", () => {
    const rows = parseCsv("Bill Date,Bill Number,Vendor Name,Description,Quantity,Rate,Tax %\n2026-11-04,B-1,X,Fee,1,100,0");
    const { docs } = buildDrafts("bill", rows.slice(1), guessColumns(rows[0], BILL_FIELDS));
    expect(docs[0].lines[0].taxCode).toBe("OS");
  });

  it("guesses a category from an account name", () => {
    expect(guessCategory("Rent Expense", "other")).toBe("rent");
    expect(guessCategory("Fuel & Salik", "other")).toBe("transport");
    expect(guessCategory("", "cogs")).toBe("cogs");
    expect(guessCategory("Something odd", "other")).toBe("other");
  });
});

describe("VAT-inclusive amounts", () => {
  it("finds the net whose VAT adds back to the amount", () => {
    expect(netFromGross(105, "SR")).toBe(100);
    expect(netFromGross(10.5, "SR")).toBe(10);
    expect(netFromGross(100, "ZR")).toBe(100);
    for (const g of [0.05, 1, 9.99, 33.33, 1234.56, 36246, 99999.99]) {
      const n = netFromGross(g, "SR");
      expect(docTax([{ net: n, code: "SR" }]).total).toBeCloseTo(g, 2);
    }
  });

  it("splits several lines so they add up per code", () => {
    const lines = [
      { gross: 105, code: "SR" },
      { gross: 52.5, code: "SR" },
      { gross: 40, code: "ZR" },
    ];
    const nets = netsFromGross(lines);
    expect(nets[2]).toBe(40);
    expect(Math.round((nets[0] + nets[1]) * 100)).toBe(15000);
  });

  it("a gross document comes to the amount in the file", () => {
    const doc: DraftDoc = {
      key: "k", kind: "invoice", number: "I-1", date: "2026-11-01", termsDays: 30, party: "A", ref: "", address: "", category: "", basis: "gross",
      lines: [
        { description: "a", qty: 2, price: 52.5, kind: "product", taxCode: "SR" },
        { description: "b", qty: 1, price: 52.5, kind: "product", taxCode: "SR" },
      ],
      csvTotal: 157.5, vatOverride: null, acceptDiff: false,
      paid: { on: false, amount: 0, date: "", method: "bank", bankAccountId: null, reference: "" },
    };
    const { tax } = finalizeDoc(doc);
    expect(tax.total).toBe(157.5);
    expect(tax.vat).toBe(7.5);
  });
});

describe("checks before saving", () => {
  const base = (over: Partial<DraftDoc> = {}): DraftDoc => ({
    key: "k", kind: "invoice", number: "INV-1", date: "2026-11-02", termsDays: 30, party: "ACME", ref: "", address: "Dubai", category: "", basis: "net",
    lines: [{ description: "Laptop", qty: 2, price: 1000, kind: "product", taxCode: "SR" }],
    csvTotal: 2100, vatOverride: null, acceptDiff: false,
    paid: { on: false, amount: 0, date: "", method: "bank", bankAccountId: null, reference: "" },
    ...over,
  });
  const ctx = { today: "2026-11-18", exists: false, duplicateInBatch: false, partyReady: true, hasOurTrn: true };

  it("passes a good document", () => {
    const c = checkDoc(base(), ctx);
    expect(c.errors).toEqual([]);
    expect(c.tax.total).toBe(2100);
    expect(c.difference).toBe(0);
  });

  it("refuses the future, duplicates, an unmapped party and a missing TRN", () => {
    const c = checkDoc(base({ date: "2026-12-01" }), { ...ctx, exists: true, duplicateInBatch: true, partyReady: false, hasOurTrn: false });
    expect(c.errors.join(" ")).toMatch(/future/);
    expect(c.errors.join(" ")).toMatch(/already in the system/);
    expect(c.errors.join(" ")).toMatch(/twice/);
    expect(c.errors.join(" ")).toMatch(/Pick the customer/);
    expect(c.errors.join(" ")).toMatch(/TRN/);
  });

  it("blocks a total that differs from the file until it is accepted", () => {
    const d = base({ csvTotal: 2000 });
    expect(checkDoc(d, ctx).errors.join(" ")).toMatch(/differs from the file/);
    expect(checkDoc({ ...d, acceptDiff: true }, ctx).errors).toEqual([]);
  });

  it("checks the paid row", () => {
    const paid = { on: true, amount: 3000, date: "2026-11-01", method: "bank" as const, bankAccountId: null, reference: "" };
    const e = checkDoc(base({ paid }), ctx).errors.join(" ");
    expect(e).toMatch(/more than the total/);
    expect(e).toMatch(/before the document date/);
  });

  it("only offers the codes that suit the document", () => {
    const d = base({ lines: [{ description: "x", qty: 1, price: 100, kind: "product", taxCode: "RC" }], csvTotal: null });
    expect(checkDoc(d, ctx).errors.join(" ")).toMatch(/cannot be used on an invoice/);
    expect(checkDoc({ ...d, kind: "bill" }, ctx).errors.join(" ")).not.toMatch(/cannot be used/);
  });
});
