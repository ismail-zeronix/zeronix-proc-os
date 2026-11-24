import { describe, expect, it } from "vitest";
import { normalizeBrand, normalizeCurrency, normalizeName, normalizePartNumber, normalizePhone, normalizeStorage, parseRamGb } from "@/lib/parse/clean";
import { compatible, cpuToken, matchKey } from "@/lib/parse/match";
import { searchTerms } from "@/lib/search";

describe("clean-up rules", () => {
  it("writes brands one way", () => {
    expect(normalizeBrand("hp")).toBe("HP");
    expect(normalizeBrand("Hewlett Packard")).toBe("HP");
    expect(normalizeBrand("tp link")).toBe("TP-Link");
    expect(normalizeBrand("  lenovo ")).toBe("Lenovo");
    expect(normalizeBrand("some maker")).toBe("Some Maker");
    expect(normalizeBrand("")).toBe("");
  });

  it("writes part numbers, RAM and storage one way", () => {
    expect(normalizePartNumber(" fm0013dx ")).toBe("FM0013DX");
    expect(normalizePartNumber("15-fd0130wm")).toBe("15-FD0130WM");
    expect(parseRamGb("16GB")).toBe(16);
    expect(parseRamGb("16 gb ddr5")).toBe(16);
    expect(parseRamGb("1TB")).toBe(1024);
    expect(normalizeStorage("512 ssd")).toBe("512GB SSD");
    expect(normalizeStorage("1tb nvme")).toBe("1TB NVME");
    expect(normalizeStorage("1 SSD")).toBe("1TB SSD");
    expect(normalizeStorage("512GB M.2 PCIe 4.0")).toBe("512GB M.2 PCIe 4.0");
  });

  it("reads currencies, phone numbers and names", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency("$")).toBe("USD");
    expect(normalizeCurrency("Dhs")).toBe("AED");
    expect(normalizeCurrency("dollars")).toBe("");
    expect(normalizePhone("050 123 4567")).toBe("971501234567");
    expect(normalizePhone("+971 50 123 4567")).toBe("971501234567");
    expect(normalizePhone("00971501234567")).toBe("971501234567");
    expect(normalizePhone("123")).toBe("");
    expect(normalizeName("Ali Computers - JLT")).toBe("alicomputersjlt");
  });
});

describe("matching", () => {
  it("extracts the CPU model number", () => {
    expect(cpuToken("Core i5-13420H")).toBe("13420h");
    expect(cpuToken("Core Ultra 5 226V")).toBe("226v");
    expect(cpuToken("Core i3-N305")).toBe("n305");
    expect(cpuToken("Core Ultra 7")).toBe("");
  });

  it("keeps different configurations of a family code apart", () => {
    const a = { brand: "Lenovo", partNumber: "15IRH10", modelName: "IdeaPad Slim 3", cpu: "Core i5-13420H", ramGb: 8, storage: "512GB" };
    const b = { ...a, cpu: "Core i7-13620H", ramGb: 16 };
    expect(matchKey(a)).not.toBe(matchKey(b));
    expect(compatible(a, b)).toBe(false);
  });

  it("treats a vaguer quote of the same SKU as compatible", () => {
    expect(compatible({ cpu: "Core Ultra 7 256V", ramGb: 16 }, { cpu: "U7", ramGb: 16 })).toBe(true);
    expect(compatible({ cpu: "Core Ultra 7 256V", ramGb: 16 }, { cpu: "", ramGb: null })).toBe(true);
  });

  it("builds a key without part number from model + specs", () => {
    expect(matchKey({ brand: "Lenovo", partNumber: "", modelName: "V15 Gen 5", cpu: "i5-13420H", ramGb: 16, storage: "512GB" })).toBe(
      "lenovo|v15gen5|13420h|16|512gb",
    );
  });
});

describe("search terms", () => {
  it("joins short numbers to the word before them", () => {
    expect(searchTerms("core 7 150u")).toEqual(["core7", "150u"]);
    expect(searchTerms("Ultra 7  16GB")).toEqual(["ultra7", "16gb"]);
    expect(searchTerms("i5-13420H")).toEqual(["i513420h"]);
    expect(searchTerms("15-FD0130WM")).toEqual(["15fd0130wm"]);
  });
});
