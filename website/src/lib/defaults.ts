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
  // Zeronix's own profiles (linked from zeronix.ae, checked 2026-11-04); Website › Settings › Brand can change them
  profiles: "https://www.linkedin.com/company/zeronixtechnology https://www.instagram.com/zeronixuae https://www.facebook.com/zeronixuae https://www.youtube.com/@ZeronixTech https://x.com/zeronixuae https://www.trustpilot.com/review/zeronix.ae",
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
  benefits: [],
  bundles: { title: "", text: "", cta: "", href: "" },
  featured: { title: "Featured products", text: "" },
  services: [],
  stats: [],
  reasons: [],
  ctaBand: { title: "Equipping a team? Get B2B pricing today.", text: "" },
};

export const SITE_URL = (process.env.SITE_URL ?? "https://zeronixtech.com").replace(/\/$/, "");
