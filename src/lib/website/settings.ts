import "server-only";
import { eq } from "drizzle-orm";
import { siteDb, siteSchema } from "@/db/site";
import type { SiteBrand, SiteHome } from "./contract";

/** What the site shows before anyone has edited Website › Settings. */
export const BRAND_DEFAULTS: SiteBrand = {
  name: "Zeronix Tech",
  tagline: "Business IT, matched to your industry.",
  subline: "UAE-stock laptops, desktops, workstations and servers, with corporate pricing.",
  email: "",
  phone: "",
  whatsapp: "",
  address: "Dubai, United Arab Emirates",
  ctaLabel: "Get B2B pricing",
};

/** The home page's words before anyone has edited Website › Pages. The hero title falls back to the brand tagline. */
export const HOME_DEFAULTS: SiteHome = {
  topLinks: [
    { label: "IT products", href: "/products" },
    { label: "IT solutions", href: "/services" },
    { label: "Business procurement", href: "/quote" },
  ],
  hero: {
    eyebrow: "IT products and solutions for business",
    title: "Technology that powers your business.",
    subtitle: "Industry-focused IT products, infrastructure and solutions, from one trusted partner in the UAE.",
    shopLabel: "Shop products",
    checks: ["IT products", "Solutions and deployment", "Ongoing support"],
  },
  intents: [
    { icon: "users", label: "Equip teams", href: "/industries" },
    { icon: "network", label: "Build IT infrastructure", href: "/services/networking-wifi" },
    { icon: "shield-check", label: "Secure your business", href: "/services/cybersecurity" },
    { icon: "layers", label: "Scale with support", href: "/services/it-amc-support" },
  ],
  benefits: [
    { icon: "truck", title: "UAE-wide delivery", text: "Fast, tracked and insured" },
    { icon: "building", title: "Business and bulk pricing", text: "Special rates for companies" },
    { icon: "badge-check", title: "Genuine products", text: "UAE stock from leading brands" },
    { icon: "headset", title: "Expert IT support", text: "From setup to after-sales" },
  ],
  business: {
    title: "Buying for your company?",
    text: "Bulk procurement, standard configurations, deployment and ongoing IT support.",
    cta: "Request a business quote",
    href: "/quote",
  },
  office: {
    title: "Setting up a new office?",
    items: [
      { label: "IT infrastructure and networking", href: "/services/networking-wifi" },
      { label: "Devices and software", href: "/products" },
      { label: "Security and access control", href: "/services/access-control" },
      { label: "AV and meeting rooms", href: "/services/av-meeting-rooms" },
    ],
  },
  bundles: {
    title: "Ready-to-work bundles",
    text: "Laptop, screen, dock and headset, matched to the role and priced together.",
    cta: "Explore bundles",
    href: "/quote?topic=bundle",
  },
  featured: { title: "Featured products", text: "Business laptops, desktops and workstations, in stock in the UAE." },
  services: [
    { icon: "headset", label: "IT AMC and remote support", href: "/services/it-amc-support" },
    { icon: "wifi", label: "Networking and Wi-Fi", href: "/services/networking-wifi" },
    { icon: "shield-check", label: "Cybersecurity", href: "/services/cybersecurity" },
    { icon: "cctv", label: "CCTV and surveillance", href: "/services/cctv-surveillance" },
    { icon: "id-card", label: "Access control and attendance", href: "/services/access-control" },
    { icon: "presentation", label: "AV and meeting rooms", href: "/services/av-meeting-rooms" },
    { icon: "phone", label: "IP telephony and PBX", href: "/services/ip-telephony" },
    { icon: "layers", label: "IT consultancy and office setup", href: "/services/it-consultancy-office-setup" },
  ],
  stats: [
    { value: "UAE", label: "Stock and local warranty" },
    { value: "B2B", label: "Corporate pricing and terms" },
    { value: "24h", label: "Quote turnaround" },
    { value: "4+", label: "Leading business brands" },
  ],
  reasons: [
    { icon: "badge-check", title: "Business-grade only", text: "Business series from the major brands, not consumer models." },
    { icon: "shield-check", title: "UAE warranty", text: "Middle East part numbers, Arabic/English keyboards, local service." },
    { icon: "receipt", title: "Corporate pricing", text: "Volume pricing, VAT invoices and credit terms for companies." },
    { icon: "headset", title: "Advice, not just boxes", text: "We help you match machines to roles before you buy." },
  ],
  ctaBand: {
    title: "Equipping a team? Get B2B pricing today.",
    text: "Send us your industry, the models you like and how many you need. We reply with a quote, usually within a working day.",
  },
};

async function read(key: string): Promise<Record<string, unknown> | undefined> {
  const [row] = await siteDb.select().from(siteSchema.siteSettings).where(eq(siteSchema.siteSettings.key, key)).limit(1);
  return row?.value;
}

async function write(key: string, value: Record<string, unknown>, userId: number): Promise<void> {
  await siteDb
    .insert(siteSchema.siteSettings)
    .values({ key, value, updatedBy: userId })
    .onConflictDoUpdate({ target: siteSchema.siteSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
}

export async function getBrand(): Promise<SiteBrand> {
  return { ...BRAND_DEFAULTS, ...((await read("brand")) as Partial<SiteBrand> | undefined) };
}

export async function saveBrand(brand: SiteBrand, userId: number): Promise<void> {
  await write("brand", { ...brand }, userId);
}

/**
 * Saved words over the defaults, section by section: a section saved before it existed falls back to the default (a
 * list saved empty stays empty, which hides that section), and fields from older layouts (features, steps) are dropped.
 */
export function mergeHome(saved: Partial<SiteHome> | undefined): SiteHome {
  const d = HOME_DEFAULTS;
  const s = saved ?? {};
  const list = <K extends keyof SiteHome>(k: K): SiteHome[K] => (Array.isArray(s[k]) ? (s[k] as SiteHome[K]) : d[k]);
  const obj = <K extends "business" | "office" | "bundles" | "featured" | "ctaBand">(k: K): SiteHome[K] => ({ ...d[k], ...s[k] });
  // words saved for the first layout (before intents existed) were written for a different hero: start it fresh
  const hero = { ...d.hero, ...(s.intents ? s.hero : undefined) };
  return {
    topLinks: list("topLinks"),
    hero: { eyebrow: hero.eyebrow, title: hero.title, subtitle: hero.subtitle, shopLabel: hero.shopLabel || d.hero.shopLabel, checks: Array.isArray(hero.checks) ? hero.checks : d.hero.checks },
    intents: list("intents"),
    benefits: list("benefits"),
    business: obj("business"),
    office: { ...obj("office"), items: Array.isArray(s.office?.items) ? s.office.items : d.office.items },
    bundles: obj("bundles"),
    featured: obj("featured"),
    services: list("services"),
    stats: list("stats"),
    reasons: list("reasons"),
    ctaBand: obj("ctaBand"),
  };
}

export async function getHome(): Promise<SiteHome> {
  return mergeHome((await read("home")) as Partial<SiteHome> | undefined);
}

export async function saveHome(home: SiteHome, userId: number): Promise<void> {
  await write("home", { ...home }, userId);
}
