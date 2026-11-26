import "server-only";
import { eq, inArray } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import type { SiteIcon } from "./contract";
import type { SiteSpecTemplate } from "./types";

/**
 * The Gaming section of zeronixtech.com (owner 2026-11-22): five gaming categories, the "Zeronix" brand for our own
 * builds, and the five Zeronix Custom PCs. Only rows: no new tables or columns. The site's /gaming page knows these
 * category and product slugs (website/src/lib/gaming.ts), so keep them when editing.
 *
 * The builds' prices are PLACEHOLDERS the owner asked for to see the page (2026-11-22); they come in as drafts unless
 * `publish` is set, so nothing reaches the live store before the real prices are typed in Website › Products.
 * Rows whose slug already exists are left as they are, so running it twice changes nothing.
 */

const group = (label: string, fields: [string, string, boolean?][]) => ({ label, fields: fields.map(([key, l, filter]) => ({ key, label: l, filter })) });

/** Gaming PC template: CPU, graphics, memory first (the card chips), then the parts gamers ask about. */
const GAMING_PC_SPECS: SiteSpecTemplate = {
  groups: [
    group("Performance", [["processor", "Processor", true], ["graphics", "Graphics", true], ["memory", "Memory", true], ["storage", "Storage", true]]),
    group("Build", [["motherboard", "Motherboard"], ["cooler", "CPU cooler"], ["psu", "Power supply"], ["case", "Case"]]),
    group("Software & connectivity", [["os", "Operating system"], ["wireless", "Wireless"]]),
    group("Warranty", [["warranty", "Warranty"]]),
  ],
};
const GAMING_LAPTOP_SPECS: SiteSpecTemplate = {
  groups: [
    group("Performance", [["processor", "Processor", true], ["graphics", "Graphics", true], ["memory", "Memory", true], ["storage", "Storage", true]]),
    group("Display", [["display", "Display", true]]),
    group("Build & battery", [["weight", "Weight"], ["battery", "Battery"]]),
    group("Software & warranty", [["os", "Operating system"], ["warranty", "Warranty"]]),
  ],
};
const GAMING_MONITOR_SPECS: SiteSpecTemplate = {
  groups: [group("Display", [["size", "Size", true], ["resolution", "Resolution", true], ["refresh", "Refresh rate", true], ["panel", "Panel", true], ["response", "Response time"]]), group("Connectivity", [["ports", "Ports"]]), group("Warranty", [["warranty", "Warranty"]])],
};
const GPU_SPECS: SiteSpecTemplate = {
  groups: [group("Graphics", [["gpu", "GPU", true], ["vram", "Memory", true], ["boost", "Boost clock"], ["power", "Power", true]]), group("Connectivity", [["outputs", "Outputs"]]), group("Warranty", [["warranty", "Warranty"]])],
};
const GEAR_SPECS: SiteSpecTemplate = {
  groups: [group("Details", [["type", "Type", true], ["connection", "Connection", true], ["compatibility", "Works with"], ["colour", "Colour"]]), group("Warranty", [["warranty", "Warranty"]])],
};

const CATEGORIES: { slug: string; name: string; icon: SiteIcon; description: string; specTemplate: SiteSpecTemplate }[] = [
  { slug: "gaming-pcs", name: "Gaming PCs", icon: "cpu", description: "Zeronix Custom PCs built to order, from 1080p esports rigs to 4K monsters.", specTemplate: GAMING_PC_SPECS },
  { slug: "gaming-laptops", name: "Gaming laptops", icon: "laptop", description: "RTX gaming laptops with high-refresh screens and UAE warranty.", specTemplate: GAMING_LAPTOP_SPECS },
  { slug: "gaming-monitors", name: "Gaming monitors", icon: "presentation", description: "144 Hz to 360 Hz monitors, IPS and OLED, for every budget.", specTemplate: GAMING_MONITOR_SPECS },
  { slug: "graphics-cards", name: "Graphics cards", icon: "zap", description: "GeForce RTX and Radeon graphics cards for upgrades and new builds.", specTemplate: GPU_SPECS },
  { slug: "gaming-accessories", name: "Gaming accessories", icon: "headphones", description: "Keyboards, mice, headsets and controllers that keep up.", specTemplate: GEAR_SPECS },
];

const COMMON = { os: "Windows 11 Home", wireless: "Wi-Fi 6E and Bluetooth 5.3", warranty: "1 year Zeronix warranty, parts and labour" };

/** The five Zeronix Custom PCs. Prices are placeholders (owner 2026-11-22) until the real ones are set. */
const BUILDS: { slug: string; name: string; series: string; price: string; highlights: string[]; specs: Record<string, string> }[] = [
  {
    slug: "zeronix-volt-gaming-pc",
    name: "Zeronix Volt Gaming PC – Ryzen 5 7600, RTX 5060 8GB, 16GB DDR5, 1TB SSD",
    series: "Volt",
    price: "4299.00",
    highlights: ["Built for 1080p esports: 300+ FPS in Counter-Strike 2", "AM5 platform, ready for future Ryzen upgrades", "Assembled, tested and delivered across the UAE"],
    specs: { processor: "AMD Ryzen 5 7600 (6 cores, up to 5.1 GHz)", graphics: "NVIDIA GeForce RTX 5060 8GB", memory: "16GB DDR5-6000 (2 × 8GB)", storage: "1TB NVMe Gen4 SSD", motherboard: "B650M micro-ATX", cooler: "Single-tower air cooler, 120 mm", psu: "650W 80+ Gold", case: "Mid-tower, tempered glass, 3 ARGB fans", ...COMMON },
  },
  {
    slug: "zeronix-havoc-gaming-pc",
    name: "Zeronix Havoc Gaming PC – Ryzen 5 9600X, RTX 5060 Ti 16GB, 32GB DDR5, 1TB SSD",
    series: "Havoc",
    price: "5899.00",
    highlights: ["Every big release at 1080p High, 60+ FPS", "16GB graphics memory for new open-world games", "32GB DDR5: game and stream at the same time"],
    specs: { processor: "AMD Ryzen 5 9600X (6 cores, up to 5.4 GHz)", graphics: "NVIDIA GeForce RTX 5060 Ti 16GB", memory: "32GB DDR5-6000 (2 × 16GB)", storage: "1TB NVMe Gen4 SSD", motherboard: "B650 ATX with Wi-Fi", cooler: "Dual-heatpipe tower air cooler", psu: "750W 80+ Gold", case: "Mid-tower airflow, tempered glass, 4 ARGB fans", ...COMMON },
  },
  {
    slug: "zeronix-riptide-gaming-pc",
    name: "Zeronix Riptide Gaming PC – Ryzen 7 9700X, RTX 5070 12GB, 32GB DDR5, 2TB SSD",
    series: "Riptide",
    price: "7999.00",
    highlights: ["The 1440p sweet spot: High settings in open worlds and shooters", "Our pick for GTA VI on PC (predicted requirements)", "240 mm liquid cooling, quiet under load"],
    specs: { processor: "AMD Ryzen 7 9700X (8 cores, up to 5.5 GHz)", graphics: "NVIDIA GeForce RTX 5070 12GB", memory: "32GB DDR5-6000 CL30 (2 × 16GB)", storage: "2TB NVMe Gen4 SSD", motherboard: "B850 ATX with Wi-Fi 7", cooler: "240 mm AIO liquid cooler", psu: "750W 80+ Gold, ATX 3.1", case: "Mid-tower, panoramic glass, 6 ARGB fans", ...COMMON },
  },
  {
    slug: "zeronix-warpath-gaming-pc",
    name: "Zeronix Warpath Gaming PC – Ryzen 7 9800X3D, RTX 5070 Ti 16GB, 32GB DDR5, 2TB SSD",
    series: "Warpath",
    price: "10999.00",
    highlights: ["Ryzen 7 9800X3D, the fastest gaming processor", "High-refresh 1440p and entry 4K", "360 mm liquid cooling and an 850W Gold supply"],
    specs: { processor: "AMD Ryzen 7 9800X3D (8 cores, 3D V-Cache)", graphics: "NVIDIA GeForce RTX 5070 Ti 16GB", memory: "32GB DDR5-6000 CL30 (2 × 16GB)", storage: "2TB NVMe Gen4 SSD", motherboard: "X870 ATX with Wi-Fi 7", cooler: "360 mm AIO liquid cooler", psu: "850W 80+ Gold, ATX 3.1", case: "Dual-chamber showcase case, 7 ARGB fans", ...COMMON },
  },
  {
    slug: "zeronix-juggernaut-gaming-pc",
    name: "Zeronix Juggernaut Gaming PC – Ryzen 7 9800X3D, RTX 5090 32GB, 64GB DDR5, 4TB SSD",
    series: "Juggernaut",
    price: "21999.00",
    highlights: ["4K at max settings in every game we list", "RTX 5090 with 32GB for games, AI and 3D work", "64GB DDR5 and 4TB of fast storage"],
    specs: { processor: "AMD Ryzen 7 9800X3D (8 cores, 3D V-Cache)", graphics: "NVIDIA GeForce RTX 5090 32GB", memory: "64GB DDR5-6000 CL30 (2 × 32GB)", storage: "4TB NVMe Gen4 SSD (2 × 2TB)", motherboard: "X870E ATX with Wi-Fi 7", cooler: "360 mm AIO liquid cooler with LCD", psu: "1200W 80+ Platinum, ATX 3.1", case: "Full-tower dual-chamber, 9 ARGB fans", ...COMMON },
  },
];

/** Adds what is missing and says how many rows of each were new. `publish` puts the builds live (local preview only). */
export async function addGamingStarter(opts: { publish?: boolean } = {}): Promise<{ categories: number; brands: number; products: number }> {
  const C = siteSchema.siteCategories;
  const B = siteSchema.siteBrands;
  const P = siteSchema.siteProducts;
  const last = await siteDb.select({ sort: C.sort }).from(C);
  const base = Math.max(0, ...last.map((r) => r.sort)) + 1;
  const categories = await siteDb
    .insert(C)
    .values(CATEGORIES.map((x, i) => ({ ...x, sort: base + i, status: "published" as const })))
    .onConflictDoNothing({ target: C.slug })
    .returning({ id: C.id });
  const brands = await siteDb.insert(B).values({ slug: "zeronix", name: "Zeronix", website: "https://zeronixtech.com/gaming", uaeWarrantyNote: "Zeronix Custom PCs carry our own warranty, parts and labour, handled in the UAE.", status: "published" }).onConflictDoNothing({ target: B.slug }).returning({ id: B.id });

  const [cat] = await siteDb.select({ id: C.id }).from(C).where(eq(C.slug, "gaming-pcs"));
  const [brand] = await siteDb.select({ id: B.id }).from(B).where(eq(B.slug, "zeronix"));
  const have = new Set((await siteDb.select({ slug: P.slug }).from(P).where(inArray(P.slug, BUILDS.map((b) => b.slug)))).map((r) => r.slug));
  const fresh = BUILDS.filter((b) => !have.has(b.slug));
  if (fresh.length)
    await siteDb.insert(P).values(
      fresh.map((b) => ({
        slug: b.slug,
        name: b.name,
        series: b.series,
        categoryId: cat?.id ?? null,
        brandId: brand?.id ?? null,
        highlights: b.highlights,
        specs: b.specs,
        priceMode: "public" as const,
        listPrice: b.price,
        availability: "ships_soon" as const,
        uaeNotes: { warranty: "1 year Zeronix warranty, parts and labour" },
        status: opts.publish ? ("published" as const) : ("draft" as const),
      })),
    );
  return { categories: categories.length, brands: brands.length, products: fresh.length };
}
