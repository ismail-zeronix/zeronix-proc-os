import { describe, expect, it } from "vitest";
import { aedSql, toAed } from "@/lib/fx";
import { categoryFromSheetName, detectBasis, normalizeStock, parseSpec, parseWorkbook, type SheetGrid } from "@/lib/parse/excel";
import { SUPPLIER_TYPES, supplierType } from "@/lib/supplier-types";

const HEAD = ["P/N", "DESCRIPTION", "LIST PRICE FOB JA", "STOCK STATUS", "MODEL", "REMARKS"];
const top = (n: number) => Array.from({ length: n }, () => [null, null, null, null, null, null]);

// Same layout as a Mitsumi Lenovo sheet: 6 blank rows, header on row 7, a group heading, then SKUs.
const laptops: SheetGrid = {
  name: "Thinkpad Classic",
  rows: [
    ...top(6),
    HEAD,
    [null, "ThinkPad L14 Gen 7"],
    [
      "21X20019GR",
      'L14 PTL,U5-325,16GB DDR5,512GB SSD M.2 2280 TLC G4,Integrated,Win 11 Pro 64,14.0" WUXGA AG 400nits,5M RGB+IR Cam,Intel BE213 2x2 BE+BT, , , , ,N-SCR,Y-FPR,3 Cell 46.5Whr,65W USB-C 3PIN-UK,BKLT KB Arabic, , ,1 Year Carry-in,3Y Carry-in-HB, ',
      1590,
      "On Order ",
      "L14",
    ],
    [
      "21X20013GR",
      'L14 PTL,U7-355,16GB DDR5,1TB SSD M.2 2280 TLC G4,Integrated,No OS,14.0" WUXGA AG 400nits,BKLT KB English,3Y On-site',
      "TBA",
      "In Stock ",
      "L14",
    ],
    [null, "ThinkPad X1 Carbon Gen 14 Aura Edition"],
    [
      "21V7008DGR",
      'X1 Carbon G14 PTL,UX7-368H,64GB Soldered LPDDR5x,1TB SSD M.2 2280 TLC G4,Intel Arc,Win 11 Pro 64,14.0" 2.8K OLED AG 500nits,3 Year Carry-in',
      3200,
      "On Order",
      "X1",
    ],
  ],
};

// Monitors repeat the price/stock headers and merge the description over three columns.
const monitorDesc = 'S22-4e 21.5" Monitor, IPS panel 100HZ , 1920 x 1080, HDMI';
const monitors: SheetGrid = {
  name: "Monitors",
  rows: [
    ...top(6),
    ["P/N", "DESCRIPTION", "LIST PRICE FOB JA", "STOCK STATUS", "LIST PRICE FOB JA", "STOCK STATUS", "MODEL", "REMARKS"],
    [null, "Monitors"],
    ["64CBKAT6UK", monitorDesc, monitorDesc, monitorDesc, 70, "On Order", "S22-4e"],
  ],
};

// A sheet whose header names MODEL/REMARKS where the data really holds the price and stock.
const workstation: SheetGrid = {
  name: "WorkStation",
  rows: [
    ...top(6),
    ["P/N", "DESCRIPTION", "MODEL", "REMARKS"],
    [null, "ThinkStation P2", null, "Qty"],
    [
      "30JQS0QJ00",
      "ThinkStation P2 Tower Gen 2, Intel® Core™ Ultra 7 265 vPro® (E-cores up to 4.60GHz, 30MB), No Operating System, 16.0GB, 1x512GB SSD M.2 2280 PCIe Gen4 TLC Opal, Intel® Graphics, 3 Year On-site",
      1390,
      "In Stock ",
    ],
  ],
};

const accessories: SheetGrid = {
  name: "Lenovo Accessories",
  rows: [
    ...top(6),
    HEAD,
    ["4X41Q27244", "CASE_BO LNV T210 Black Eco", 8, "In Stocks", "BAG"],
    ["40BE0135UK", "ThinkPad Thunderbolt 4 Smart Dock Gen2 7500", 230, "In Stocks", "DOCK"],
  ],
};

const wb = () =>
  parseWorkbook([laptops, monitors, workstation, accessories], { fileName: "Lenovo PCG_2026-October.xlsx", currency: "USD" });

describe("Excel distributor price list", () => {
  it("finds the header row, the group heading and the columns", () => {
    const [l] = wb().sheets;
    expect(l.headerRow).toBe(7);
    expect(l.columns).toMatchObject({ pn: "P/N", desc: "DESCRIPTION", price: "LIST PRICE FOB JA", stock: "STOCK STATUS" });
    expect(l.drafts).toHaveLength(3);
  });

  it("reads the comma separated spec into fields", () => {
    const d = wb().sheets[0].drafts[0];
    expect(d).toMatchObject({
      partNumber: "21X20019GR",
      brand: "Lenovo",
      modelName: "ThinkPad L14 Gen 7",
      cpu: "Core Ultra 5 325",
      ramGb: 16,
      storage: "512GB SSD",
      display: '14" WUXGA',
      os: "Win 11 Pro",
      gpu: "Integrated",
      price: 1590,
      currency: "USD",
      priceBasis: "FOB JA",
      stockNote: "On order",
      category: "laptop",
    });
    // the included warranty and the keyboard layout tell the Arabic and English SKUs apart
    expect(d.extras).toBe("1Y Carry-in · Arabic KB");
    expect(wb().sheets[0].drafts[1].extras).toBe("3Y On-site · English KB");
  });

  it("keeps a row without a price and flags it instead of dropping it", () => {
    const d = wb().sheets[0].drafts[1];
    expect(d.price).toBeNull();
    expect(d.flags.join()).toContain('Price column says "TBA"');
    expect(d.os).toBe("No OS");
    expect(d.storage).toBe("1TB SSD");
  });

  it("understands Aura (UX) processors and OLED screens", () => {
    const d = wb().sheets[0].drafts[2];
    expect(d.cpu).toBe("Core Ultra X7 368H");
    expect(d.display).toBe('14" 2.8K');
    expect(d.modelName).toBe("ThinkPad X1 Carbon Gen 14");
  });

  it("picks the real price column when the sheet repeats its headers over merged cells", () => {
    const m = wb().sheets[1];
    expect(m.category).toBe("monitor");
    expect(m.drafts[0]).toMatchObject({
      price: 70,
      stockNote: "On order",
      display: '21.5" FHD',
      extras: "IPS 100Hz",
      modelName: "ThinkVision S22-4e",
    });
  });

  it("falls back to the data when a header names the wrong columns", () => {
    const w = wb().sheets[2];
    expect(w.columns.price).toBe("(from the data)");
    expect(w.drafts[0]).toMatchObject({
      price: 1390,
      stockNote: "In stock",
      ramGb: 16,
      storage: "512GB SSD",
      cpu: "Core Ultra 7 265",
      category: "workstation",
      priceBasis: "FOB JA",
    });
  });

  it("cleans accessory names and types", () => {
    const a = wb().sheets[3];
    expect(a.category).toBe("accessory");
    expect(a.drafts[0]).toMatchObject({ modelName: "LNV T210 Black Eco", extras: "bag", stockNote: "In stock" });
  });

  it("takes the brand from the file name and the basis from the header", () => {
    const r = wb();
    expect(r.brand).toBe("Lenovo");
    expect(r.basis).toBe("FOB JA");
    expect(r.currencyHint).toBe("");
  });

  it("helpers", () => {
    expect(detectBasis("LIST PRICE FOB JA")).toBe("FOB JA");
    expect(detectBasis("Price ex-VAT")).toBe("ex-VAT");
    expect(detectBasis("Price")).toBe("");
    expect(normalizeStock("ON Order")).toBe("On order");
    expect(normalizeStock("In Stocks")).toBe("In stock");
    expect(normalizeStock("ETA 2 weeks")).toBe("ETA 2 weeks");
    expect(categoryFromSheetName("E-Laptops - No O.S")).toBe("laptop");
    expect(categoryFromSheetName("Desktop ")).toBe("desktop");
    expect(categoryFromSheetName("Sheet1")).toBeNull();
    expect(parseSpec("HP 250 G10").structured).toBe(false);
  });
});

describe("currency and supplier categories", () => {
  it("converts USD at the peg and leaves unknown currencies unconverted", () => {
    expect(toAed(1000, "USD", { usd: 3.6725 })).toBe(3672.5);
    expect(toAed(1000, "AED", { usd: 3.6725 })).toBe(1000);
    expect(toAed(1000, "EUR", { usd: 3.6725 })).toBeNull();
    expect(toAed(null, "USD", { usd: 3.6725 })).toBeNull();
  });

  it("builds a CASE expression for the database", () => {
    const q = aedSql("price", "currency", { usd: 3.6725 });
    expect(JSON.stringify(q.queryChunks)).toContain("AED");
  });

  it("has the UAE market categories and tolerates unknown values", () => {
    const keys = SUPPLIER_TYPES.map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(["distributor", "big_stockist", "market", "dafza", "jafza"]));
    expect(new Set(keys).size).toBe(keys.length);
    expect(supplierType("jafza").label).toBe("JAFZA supplier");
    expect(supplierType("typo").key).toBe("other");
    expect(supplierType(null).key).toBe("other");
  });
});
