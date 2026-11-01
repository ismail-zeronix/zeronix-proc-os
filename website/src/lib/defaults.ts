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
  hero: {
    eyebrow: "Corporate IT for UAE businesses",
    title: "",
    subtitle: "Tell us what your team does. We shortlist the right business laptops, desktops, workstations and servers, in stock in the UAE, with corporate pricing and local warranty.",
    secondaryCta: "Explore by industry",
  },
  features: [],
  stats: [],
  steps: [],
  reasons: [],
  ctaBand: { title: "Equipping a team? Get B2B pricing today.", text: "" },
};

export const SITE_URL = (process.env.SITE_URL ?? "https://zeronixtech.com").replace(/\/$/, "");
