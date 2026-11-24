/**
 * Rules that write supplier data one standard way, so the same product from several suppliers lands on one product:
 * brand names, part numbers, RAM, storage, currency. Used by the Excel import, the live feeds and Claude's pushes.
 */

const BRANDS: Record<string, string> = {
  hp: "HP", hpe: "HPE", hewlettpackard: "HP", lenovo: "Lenovo", dell: "Dell", asus: "ASUS", acer: "Acer", apple: "Apple",
  msi: "MSI", microsoft: "Microsoft", samsung: "Samsung", lg: "LG", huawei: "Huawei",
  gigabyte: "Gigabyte", toshiba: "Toshiba", dynabook: "Dynabook", logitech: "Logitech",
  benq: "BenQ", viewsonic: "ViewSonic", aoc: "AOC", philips: "Philips", epson: "Epson",
  canon: "Canon", brother: "Brother", cisco: "Cisco", ubiquiti: "Ubiquiti", tplink: "TP-Link",
  kingston: "Kingston", sandisk: "SanDisk", wd: "WD", westerndigital: "WD", seagate: "Seagate",
  intel: "Intel", amd: "AMD", nvidia: "NVIDIA", razer: "Razer", xiaomi: "Xiaomi", fortinet: "Fortinet",
  synology: "Synology", qnap: "QNAP", apc: "APC", jabra: "Jabra", poly: "Poly", zebra: "Zebra",
};

export function normalizeBrand(b: string): string {
  const t = b.trim();
  if (!t) return "";
  return BRANDS[t.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? t.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizePartNumber(p: string): string {
  return p.toUpperCase().replace(/\s+/g, "").replace(/^[-–]+|[-–]+$/g, "");
}

export function parseRamGb(ram: string): number | null {
  const m = ram.match(/(\d+(?:\.\d+)?)\s*(tb|gb|g)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.round(/tb/i.test(m[2] ?? "") ? n * 1024 : n);
}

/** "512 ssd" -> "512GB SSD", "1tb nvme" -> "1TB NVME", "256GB" stays. */
export function normalizeStorage(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return (
    t
      // "512 gb" / "1t" -> "512GB" / "1TB"
      .replace(/(?<![\w.])(\d+(?:\.\d+)?)\s*(tb|gb|t|g)\b/gi, (_m, n: string, u: string) => `${n}${/^t/i.test(u) ? "TB" : "GB"}`)
      // a bare size right before the drive type: "512 SSD" is GB, "1 SSD" is a terabyte
      .replace(/(?<![\w.])(\d+)\s+(?=(ssd|hdd|nvme|emmc)\b)/gi, (_m, n: string) => `${n}${Number(n) <= 8 ? "TB" : "GB"} `)
      .replace(/\b(ssd|hdd|nvme|emmc|sata)\b/gi, (w) => w.toUpperCase())
  );
}

/** Three-letter currency, upper case; empty when it is not one. */
export function normalizeCurrency(c: string | null | undefined): string {
  const t = (c ?? "").trim().toUpperCase();
  if (t === "$" || t === "US$") return "USD";
  if (t === "DHS" || t === "DH" || t === "AED.") return "AED";
  return /^[A-Z]{3}$/.test(t) ? t : "";
}

/** UAE phone numbers one way: digits only, "050 123 4567" and "+971 50 123 4567" both -> "971501234567". */
export function normalizePhone(p: string | null | undefined): string {
  let d = (p ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^05\d{8}$/.test(d)) d = `971${d.slice(1)}`;
  return d.length >= 7 ? d : "";
}

/** A name as WhatsApp shows it, for matching: lower-case letters and digits only. */
export const normalizeName = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
