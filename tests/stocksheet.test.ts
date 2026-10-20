import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertSafeUrl, googleSheetCsvUrl } from "@/lib/feed/fetch";
import { parseCsv } from "@/lib/parse/csv";
import { matchKey } from "@/lib/parse/match";
import { parseStockSheet } from "@/lib/parse/stocksheet";

// A copy of ALTWFEEQ COMPUTER TRADING's published stock sheet.
const csv = readFileSync("tests/fixtures/altwfeeq-stock.csv", "utf8");
const sheet = parseStockSheet(csv, { currency: "USD" });
const find = (pn: string) => sheet.drafts.find((d) => d.partNumber === pn)!;

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and line breaks inside a cell", () => {
    expect(parseCsv('a,"b ""x""\nc",$1,000\r\n"d,e",f\n')).toEqual([
      ["a", 'b "x"\nc', "$1", "000"],
      ["d,e", "f"],
    ]);
  });
});

describe("ALTWFEEQ stock sheet", () => {
  it("reads every product and none lose their price", () => {
    expect(sheet.drafts.length).toBe(59);
    expect(sheet.drafts.every((d) => d.price != null && d.currency === "USD")).toBe(true);
    expect(sheet.drafts.flatMap((d) => d.flags)).toEqual([]);
  });

  it("takes the brand from the model, then the section heading", () => {
    expect(new Set(sheet.drafts.map((d) => d.brand))).toEqual(
      new Set(["Acer", "ASUS", "Dell", "HP", "Lenovo", "MSI", "ABS", "iBuyPower"]),
    );
    expect(sheet.drafts.find((d) => d.modelName.startsWith("Alienware"))?.brand).toBe("Dell");
    expect(sheet.drafts.find((d) => d.modelName.startsWith("Victus"))?.brand).toBe("HP");
  });

  it("splits a laptop row into fields", () => {
    expect(find("ANV16-61-R0YW")).toMatchObject({
      brand: "Acer",
      modelName: "Nitro V16",
      category: "laptop",
      cpu: "Ryzen 7 350",
      ramGb: 16,
      storage: "1TB SSD",
      display: '16" FHD 180Hz',
      gpu: "RTX 5060 8GB",
      os: "Win 11",
      price: 1200,
    });
  });

  it("copes with glued and abbreviated text", () => {
    // "AMD RYZEN 9-9955HX16GB DDR5 RAM"
    expect(find("G614FM-WS94")).toMatchObject({ cpu: "Ryzen 9 9955HX", ramGb: 16, modelName: "ROG Strix G16" });
    // "CORI7 13620H , 16GB DDR5 , 512GB SSD, 15.6 FHD"
    const v15 = sheet.drafts.find((d) => d.modelName === "V15 G5")!;
    expect(v15).toMatchObject({ cpu: "Core i7-13620H", ramGb: 16, storage: "512GB SSD", display: '15.6" FHD' });
    // "CORI5 14500 8GB DDR5 512GB DOS"
    expect(sheet.drafts.find((d) => d.modelName === "ProDesk 2")).toMatchObject({ cpu: "Core i5-14500", ramGb: 8, storage: "512GB", os: "DOS" });
  });

  it("uses the manufacturer code as part number", () => {
    expect(find("15-FD0084WM")).toMatchObject({ brand: "HP", modelName: "Laptop 15", cpu: "Intel N200", extras: "EN KB · Office 1Y" });
    expect(find("83K100DXPS")).toMatchObject({ brand: "Lenovo", modelName: "IdeaPad Slim 3 15IRH10", extras: "EN/AR KB" });
    expect(find("B13VEK-1675US").brand).toBe("MSI");
  });

  it("puts desktops and all-in-ones in their own category", () => {
    expect(find("F0JY0014AK").category).toBe("all-in-one");
    expect(find("SBI7N56T03")).toMatchObject({ category: "desktop", gpu: "RTX 5060 Ti 8GB" });
  });

  it("gives the same product the same match key as other suppliers' rows", () => {
    expect(matchKey(find("83VA001PUS"))).toBe("lenovo|83va001pus|170|16");
  });

  it("keeps the lower price when a product is listed twice", () => {
    const row = (price: string) => `"HP 250R G10 \n15.6"" FHD, INTEL CORE 5-120U, 8GB DDR5 RAM, 512GB SSD, DOS, D1BA6AT#A2N, EN",${price}\n`;
    const res = parseStockSheet(`HP LAPTOPS,\n${row("$600.00")}${row("$590.00")}`, { currency: "USD" });
    expect(res.drafts).toHaveLength(1);
    expect(res.drafts[0].price).toBe(590);
    expect(res.warnings[0]).toMatch(/listed twice/);
  });

  it("reports a row without a price instead of dropping it", () => {
    const res = parseStockSheet('ACER LAPTOPS,\n"ACER ASPIRE 3\n15.6"" FHD, INTEL CORE I5-1235U, 8GB DDR4 RAM, 512GB SSD, WINDOWS 11",\n', { currency: "USD" });
    expect(res.drafts).toHaveLength(1);
    expect(res.drafts[0].price).toBeNull();
    expect(res.drafts[0].flags[0]).toMatch(/No price/);
  });
});

describe("feed links", () => {
  it("turns any Google Sheets link into its CSV address", () => {
    expect(googleSheetCsvUrl("https://docs.google.com/spreadsheets/d/abc123/edit#gid=77")).toBe(
      "https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=77",
    );
    const pub = googleSheetCsvUrl("https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pubhtml");
    expect(pub).toContain("/d/e/2PACX-xyz/pub?");
    expect(pub).toContain("output=csv");
    expect(googleSheetCsvUrl("https://stocksheet.netlify.app/")).toBeNull();
  });

  it("refuses links into this machine or a private network", () => {
    for (const bad of ["http://localhost:3100", "http://127.0.0.1/x", "http://192.168.1.5/a.csv", "http://10.0.0.2", "file:///etc/passwd", "nope"]) {
      expect(() => assertSafeUrl(bad)).toThrow();
    }
    expect(() => assertSafeUrl("https://stocksheet.netlify.app/")).not.toThrow();
  });
});
