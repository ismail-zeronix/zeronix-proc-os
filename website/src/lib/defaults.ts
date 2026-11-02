import type { SiteBrand, SiteHome } from "./contract";

/** Shown only while the portal cannot be reached; the real values come from Website › Settings and Pages in the portal. */
export const BRAND_FALLBACK: SiteBrand = {
  name: "Zeronix Tech",
  tagline: "Business IT, matched to your industry.",
  subline: "UAE-stock laptops, desktops, workstations and servers, with corporate pricing.",
  email: "",
  phone: "",
  whatsapp: "",
  address: "Dubai, United Arab Emirates",
  ctaLabel: "Get B2B pricing",
};

export const HOME_FALLBACK: SiteHome = {
  topLinks: [],
  hero: {
    eyebrow: "IT products and solutions for business",
    title: "Technology that powers your business.",
    subtitle: "Industry-focused IT products, infrastructure and solutions, from one trusted partner in the UAE.",
    shopLabel: "Shop products",
    checks: [],
  },
  intents: [],
  benefits: [],
  business: { title: "Buying for your company?", text: "Bulk procurement, standard configurations, deployment and ongoing IT support.", cta: "Request a business quote", href: "/quote" },
  office: { title: "", items: [] },
  bundles: { title: "", text: "", cta: "", href: "" },
  featured: { title: "Featured products", text: "" },
  services: [],
  stats: [],
  reasons: [],
  ctaBand: { title: "Equipping a team? Get B2B pricing today.", text: "" },
};

export const SITE_URL = (process.env.SITE_URL ?? "https://zeronixtech.com").replace(/\/$/, "");
