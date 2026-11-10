import type { SiteFaqItem, SiteProductPage } from "./contract";
import { formatPrice } from "./price";

/**
 * Search title, meta description, "About this model" text and a fallback FAQ for a product page, written from the data
 * we hold (specs, part number, category, industries, stock, delivery). Plain sentence templates, no AI and nothing
 * stored: an editor's own summary, FAQ or SEO title always wins. Never claims what the data does not say (a warranty
 * nobody entered is left out, not guessed). Pure, so tests/website-seo.test.ts can check it.
 */

type Product = Pick<
  SiteProductPage,
  "name" | "brand" | "series" | "mpn" | "category" | "categorySlug" | "keySpecs" | "specGroups" | "priceMode" | "price" | "currency" | "availability" | "uae" | "bestFor" | "faq" | "seo"
> &
  Partial<Pick<SiteProductPage, "brandWarrantyNote" | "store">>;

const SITE = "Zeronix Tech";
const TITLE_MAX = 60;

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).replace(/[\s,;:–-]+\S*$/, "").trimEnd()}…`);

/** "Lenovo ThinkPad X1 Carbon Gen 14 Aura Edition, Core Ultra 7, 32GB…" → "Lenovo ThinkPad X1 Carbon Gen 14 Aura Edition". */
export function shortName(p: Pick<Product, "name" | "brand" | "series">): string {
  const base = (p.name.split(/\s*[,(|]\s*|\s+[–-]\s+/)[0] || p.name).trim();
  const named = p.brand && !base.toLowerCase().startsWith(p.brand.toLowerCase()) ? `${p.brand} ${base}` : base;
  return named.length > 48 && p.series ? (p.brand && !p.series.toLowerCase().startsWith(p.brand.toLowerCase()) ? `${p.brand} ${p.series}` : p.series) : named;
}

/** The first spec value whose key is one of `keys`. */
export function spec(p: Pick<Product, "specGroups">, ...keys: string[]): string {
  for (const k of keys) for (const g of p.specGroups) for (const r of g.rows) if (r.key === k && r.value.trim()) return r.value.trim();
  return "";
}

/** Middle East part numbers (#ABV Arabic/English, #BH5…) versus US-market ones (…US, #ABA); "" when it cannot tell. */
export function partRegion(mpn: string): "me" | "us" | "" {
  const m = mpn.trim().toUpperCase();
  if (!m) return "";
  if (/#?(ABV|BH5|AB4|ABZ|UUZ)$/.test(m)) return "me";
  if (/(#?ABA|US)$/.test(m) || /-ABA$/.test(m)) return "us";
  return "";
}

/** Under 60 characters, with the part number when it fits: "HP EliteBook 840 G11 (A1BC2EA) Price in UAE". */
export function productTitle(p: Product): string {
  if (p.seo.title) return p.seo.title;
  const name = shortName(p);
  // people searching a part number type it exactly: keep it, with the series name if the full model name is too long
  const series = p.series ? (p.brand && !p.series.toLowerCase().startsWith(p.brand.toLowerCase()) ? `${p.brand} ${p.series}` : p.series) : "";
  const names = [name, series].filter((n, i, a) => n && a.indexOf(n) === i);
  const tries = [
    ...(p.mpn ? names.flatMap((n) => [`${n} ${p.mpn} Price in UAE | ${SITE}`, `${n} ${p.mpn} Price in UAE`]) : []),
    `${name} Price in UAE | ${SITE}`,
    `${name} Price in UAE`,
    `${name} | ${SITE}`,
  ];
  return tries.find((t) => t.length <= TITLE_MAX) ?? clip(`${name} Price in UAE`, TITLE_MAX);
}

/**
 * Category search title: "Business laptops in the UAE: HP, Lenovo" (45 characters at most; the layout adds
 * " · Zeronix Tech"). Never "Business laptops for business": the name already says it.
 */
export function categoryTitle(name: string, brands: string[]): string {
  const head = /business/i.test(name) ? `${name} in the UAE` : `${name} for business in the UAE`;
  for (let n = brands.length; n > 0; n--) {
    const t = `${head}: ${brands.slice(0, n).join(", ")}`;
    if (t.length <= 45) return t;
  }
  return head;
}

/** Under 155 characters: what it is, the price (or on request) and how it is bought. */
export function productDescription(p: Product): string {
  if (p.seo.description) return p.seo.description;
  const price = p.priceMode === "public" ? formatPrice(p.price, p.currency) : null;
  const specs = p.keySpecs.slice(0, 3).join(", ");
  const head = `${shortName(p)}${p.mpn ? ` (${p.mpn})` : ""}${specs ? `: ${specs}` : ""}.`;
  const tail = `${price ? `${price} incl. VAT` : "B2B price on request"}, VAT invoice, delivery across the UAE.`;
  return head.length + tail.length + 1 <= 155 ? `${head} ${tail}` : `${clip(head, 154 - tail.length)} ${tail}`;
}

const ROLE_BY_CATEGORY: Record<string, string> = {
  laptops: "people who work between the office, client sites and home",
  desktops: "fixed desks, reception counters and shared office machines",
  workstations: "CAD, BIM, rendering, simulation and data work that outgrows an office PC",
  servers: "file sharing, backups, business applications and virtual machines for a growing office",
  monitors: "office desks that need a second screen or a sharper, larger one",
  accessories: "teams that want matching docks, headsets and peripherals",
  software: "companies licensing their teams properly",
  gaming: "gaming, streaming and heavy creative work",
};

const STOCK_TEXT: Record<Product["availability"], string> = {
  in_stock: "It is in UAE stock",
  ships_soon: "It ships in 2–5 days",
  on_order: "We order it in for you and confirm the date before you pay",
};

export interface CopyBlock {
  heading: string;
  text: string;
}

/** "About this model": who it suits, the specs in words, buying for a team, delivery and invoice. */
export function aboutModel(p: Product): CopyBlock[] {
  const name = shortName(p);
  const blocks: CopyBlock[] = [];
  const kind = p.category ? p.category.toLowerCase().replace(/^business /, "") : "model";
  const industries = [...new Set(p.bestFor.map((b) => (b.role ? `${b.role.toLowerCase()} in ${b.industry.toLowerCase()}` : b.industry.toLowerCase())))].slice(0, 3);
  const role = ROLE_BY_CATEGORY[p.categorySlug] ?? "business teams";
  blocks.push({
    heading: "Who it suits",
    text: `The ${name} is a ${p.brand ? `${p.brand} ` : ""}${kind.replace(/s$/, "")} for ${role}.${industries.length ? ` We recommend it for ${industries.join(", ").replace(/, ([^,]*)$/, " and $1")}.` : ""}`,
  });

  const cpu = spec(p, "processor", "cpu");
  const ram = spec(p, "memory", "ram");
  const ssd = spec(p, "storage");
  const screen = spec(p, "display", "screen", "size");
  const gpu = spec(p, "graphics", "gpu");
  const os = spec(p, "os", "operating_system");
  const weight = spec(p, "weight");
  const parts = [cpu && `runs on ${cpu}`, ram && `has ${ram} of memory`, ssd && `${ssd}${/storage|ssd|hdd|nvme/i.test(ssd) ? "" : " of storage"}`].filter(Boolean) as string[];
  if (parts.length) {
    const noOs = /^(no os|none|dos|free ?dos|without)/i.test(os);
    const extra = [screen && `a ${screen} display`, gpu && !/^intel( uhd| iris| graphics)?$/i.test(gpu) && `${gpu} graphics`, os && !noOs && os].filter(Boolean) as string[];
    const and = (l: string[]) => l.join(", ").replace(/, ([^,]*)$/, " and $1");
    blocks.push({
      heading: "The specs in plain words",
      text: [
        `This configuration ${and(parts)}.`,
        extra.length && `It comes with ${and(extra)}.`,
        noOs && "It ships without Windows, so add a licence to your quote if you need one.",
        weight && `It weighs ${weight}.`,
        "The full list is in the specifications below.",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  const region = partRegion(p.mpn);
  const warranty = p.uae.warranty || p.brandWarrantyNote || "";
  const keyboard = p.uae.keyboard || spec(p, "keyboard");
  const team = [
    p.mpn && region === "me" && `Part number ${p.mpn} is the maker's Middle East configuration.`,
    p.mpn && region === "us" && `Part number ${p.mpn} is the maker's US-market configuration, so check the keyboard layout and how the warranty works in the UAE; we confirm both in writing on your quote.`,
    p.mpn && !region && `Quote part number ${p.mpn} when you order so every unit is identical.`,
    keyboard && `Keyboard: ${keyboard}.`,
    warranty && `Warranty: ${warranty}`.replace(/\.?$/, "."),
    "Buying several? Ask for one quote: we hold the same configuration across the order and invoice it in your company's name.",
  ].filter(Boolean) as string[];
  blocks.push({ heading: "Buying it for a team in the UAE", text: team.join(" ") });

  const price = p.priceMode === "public" ? formatPrice(p.price, p.currency) : null;
  const fee = p.store?.deliveryFee ?? null;
  const free = p.store?.freeAbove ?? 0;
  const delivery =
    fee === 0 ? "Delivery is free to all seven emirates" : free > 0 ? `Delivery is free on orders from ${formatPrice(String(free), p.currency)}` : "We deliver to all seven emirates";
  blocks.push({
    heading: "Price, delivery and invoice",
    text: `${price ? `The price is ${price} including 5% VAT.` : "Pricing depends on quantity, so we quote it for your order."} ${STOCK_TEXT[p.availability] ?? STOCK_TEXT.in_stock}. ${delivery}, and every order comes with a UAE tax invoice.`,
  });
  return blocks;
}

/** Questions for products nobody has written an FAQ for; each answer uses only what the data says. */
export function productFaq(p: Product): SiteFaqItem[] {
  if (p.faq.length) return p.faq;
  const name = shortName(p);
  const price = p.priceMode === "public" ? formatPrice(p.price, p.currency) : null;
  const warranty = p.uae.warranty || p.brandWarrantyNote || "";
  const keyboard = p.uae.keyboard || spec(p, "keyboard");
  const items: (SiteFaqItem | false)[] = [
    {
      q: `What is the price of the ${name} in the UAE?`,
      a: price
        ? `${price} including 5% VAT, with a UAE tax invoice. Companies buying several units can ask for B2B pricing.`
        : `We quote it for your quantity, usually within a working day, with a UAE tax invoice. Ask for B2B pricing on this page.`,
    },
    keyboard ? { q: `Which keyboard does the ${name} have?`, a: `${keyboard}.${partRegion(p.mpn) === "us" ? " This is the US-market configuration; ask us if you need Arabic/English." : ""}` } : false,
    warranty ? { q: `What warranty comes with the ${name}?`, a: warranty } : false,
    { q: `How fast can you deliver the ${name}?`, a: `${STOCK_TEXT[p.availability] ?? STOCK_TEXT.in_stock}. We deliver to Dubai, Abu Dhabi, Sharjah and the other emirates, and you can collect from our office.` },
    { q: `Can my company buy the ${name} in bulk?`, a: "Yes. Send the quantity and delivery address and we reply with volume pricing, the same configuration for every unit and one VAT invoice in your company's name." },
  ];
  return items.filter(Boolean) as SiteFaqItem[];
}
