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
  hero: {
    eyebrow: "Corporate IT for UAE businesses",
    title: "",
    subtitle: "Tell us what your team does. We shortlist the right business laptops, desktops, workstations and servers, in stock in the UAE, with corporate pricing and local warranty.",
    secondaryCta: "Explore by industry",
  },
  features: [
    { tag: "Who we are", title: "The UAE partner that matches business IT to the work", text: "", href: "/about", image: "who-we-are" },
    { tag: "Industry", title: "Best laptops for real estate agents in the UAE", text: "", href: "/industries/real-estate", image: "industry-real-estate" },
    { tag: "Guide", title: "Workstations for architects: what really matters", text: "", href: "/industries/architecture-design", image: "guide-architect" },
  ],
  stats: [
    { value: "UAE", label: "Stock and local warranty" },
    { value: "B2B", label: "Corporate pricing and terms" },
    { value: "24h", label: "Quote turnaround" },
    { value: "4+", label: "Leading business brands" },
  ],
  steps: [
    { title: "Tell us your industry", text: "Real estate, design, clinics, finance: each team needs something different." },
    { title: "Get a shortlist", text: "UAE models compared on what matters for your work, with full specs." },
    { title: "Receive B2B pricing", text: "A quote for your quantity, delivered across the Emirates." },
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

export async function getHome(): Promise<SiteHome> {
  const saved = (await read("home")) as Partial<SiteHome> | undefined;
  return { ...HOME_DEFAULTS, ...saved, hero: { ...HOME_DEFAULTS.hero, ...saved?.hero }, ctaBand: { ...HOME_DEFAULTS.ctaBand, ...saved?.ctaBand } };
}

export async function saveHome(home: SiteHome, userId: number): Promise<void> {
  await write("home", { ...home }, userId);
}
