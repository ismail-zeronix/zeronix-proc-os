/**
 * What /api/site/* returns to the public site. website/src/lib/contract.ts is a copy of this file (the site cannot import
 * from the portal); tests/website-contract.test.ts fails when the two differ. Bump CONTRACT_VERSION on any breaking change.
 */

export const CONTRACT_VERSION = 1;

/** Icons an editor may pick for industries, categories and home sections; the site maps each name to a lucide icon. */
export const SITE_ICONS = [
  "building",
  "pen-tool",
  "hard-hat",
  "scale",
  "stethoscope",
  "landmark",
  "graduation-cap",
  "hotel",
  "truck",
  "clapperboard",
  "shopping-bag",
  "briefcase",
  "laptop",
  "monitor",
  "cpu",
  "server",
  "shield-check",
  "badge-check",
  "headset",
  "package-check",
  "receipt",
  "zap",
] as const;

export type SiteIcon = (typeof SITE_ICONS)[number];

export interface SiteBrand {
  name: string;
  tagline: string;
  /** A second line under the tagline on the home page. */
  subline: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  /** Header button and the default call to action. */
  ctaLabel: string;
}

/** The home page's own words (Website › Pages). Industries, categories and brands come from the catalog. */
export interface SiteHome {
  hero: { eyebrow: string; title: string; subtitle: string; secondaryCta: string };
  /** The three cards under the hero (Finovate row): the middle one is the lime highlight. `image` names a site image. */
  features: { tag: string; title: string; text: string; href: string; image: string }[];
  stats: { value: string; label: string }[];
  steps: { title: string; text: string }[];
  reasons: { icon: SiteIcon | ""; title: string; text: string }[];
  ctaBand: { title: string; text: string };
}

export interface SiteHealth {
  ok: true;
  contract: number;
}

export interface SiteSettingsResponse {
  contract: number;
  brand: SiteBrand;
  home: SiteHome;
}

export interface SiteNavLink {
  slug: string;
  name: string;
  icon: SiteIcon | "";
  /** One line for cards and the mega menu. */
  summary: string;
}

/** Everything the mega menu needs, in display order. Only published records. */
export interface SiteNavResponse {
  contract: number;
  industries: SiteNavLink[];
  categories: SiteNavLink[];
  brands: SiteNavLink[];
}

// ---------- catalog pages (W.3) ----------

/** A picture on the site: `src` is a path on the site itself (/media/<id>), never the portal's address. */
export interface SiteImageRef {
  src: string;
  alt: string;
}

export interface SiteFaqItem {
  q: string;
  a: string;
}

/** What a product card needs. Prices stay "on request" until the shop (WEBSITE-PLAN.md section 11). */
export interface SiteProductSummary {
  slug: string;
  name: string;
  brand: string;
  brandSlug: string;
  category: string;
  categorySlug: string;
  image: SiteImageRef | null;
  /** The first three spec values of the category template, for the chips on the card. */
  keySpecs: string[];
  highlights: string[];
  priceMode: "hidden" | "on_request" | "public";
  price: string | null;
  currency: string;
}

export interface SiteSpecGroup {
  label: string;
  rows: { key: string; label: string; value: string }[];
}

export interface SiteProductPage extends SiteProductSummary {
  contract: number;
  mpn: string;
  series: string;
  summaryHtml: string;
  images: SiteImageRef[];
  specGroups: SiteSpecGroup[];
  uaeAvailable: boolean;
  uae: { keyboard?: string; warranty?: string; region?: string };
  sourceUrl: string;
  specsCheckedAt: string | null;
  pros: string[];
  cons: string[];
  faq: SiteFaqItem[];
  bestFor: { industrySlug: string; industry: string; role: string; label: string }[];
  related: SiteProductSummary[];
  seo: { title?: string; description?: string };
}

export interface SiteIndustryCard extends SiteNavLink {
  image: SiteImageRef | null;
}

export interface SiteIndustriesResponse {
  contract: number;
  industries: SiteIndustryCard[];
}

export interface SiteIndustryPage extends SiteIndustryCard {
  contract: number;
  heroTitle: string;
  introHtml: string;
  painPoints: string[];
  roles: { role: string; needs: string; categories: { slug: string; name: string }[] }[];
  faq: SiteFaqItem[];
  products: (SiteProductSummary & { label: string; role: string })[];
  seo: { title?: string; description?: string };
}

export interface SiteCategoryPage extends SiteNavLink {
  contract: number;
  image: SiteImageRef | null;
  brands: { slug: string; name: string; count: number }[];
  industries: { slug: string; name: string; count: number }[];
  products: (SiteProductSummary & { industries: string[] })[];
  seo: { title?: string; description?: string };
}

export interface SiteCategoriesResponse {
  contract: number;
  categories: (SiteNavLink & { image: SiteImageRef | null; count: number })[];
}

export interface SiteBrandPage {
  contract: number;
  slug: string;
  name: string;
  website: string;
  uaeWarrantyNote: string;
  products: SiteProductSummary[];
}

/** Two to four products side by side; rows follow the first product's category template. */
export interface SiteCompareResponse {
  contract: number;
  products: SiteProductSummary[];
  groups: { label: string; rows: { label: string; values: string[] }[] }[];
}

// ---------- guides and blog (W.4) ----------

/** A byline: the person who uploaded the post (an admin can change it). */
export interface SiteAuthor {
  slug: string;
  name: string;
  jobTitle: string;
}

export type SitePostType = "guide" | "comparison" | "article" | "industry_page" | "page";

export interface SitePostSummary {
  slug: string;
  type: SitePostType;
  /** /guides/slug or /blog/slug */
  path: string;
  title: string;
  excerpt: string;
  cover: SiteImageRef | null;
  category: string;
  industry: { slug: string; name: string } | null;
  author: SiteAuthor | null;
  publishedAt: string;
  readingMinutes: number;
}

/** The body, cut at its shortcodes: HTML pieces and live components between them. */
export type SitePostBlock = { kind: "html"; html: string } | { kind: "product"; product: SiteProductSummary } | { kind: "compare" } | { kind: "cta"; text: string };

export interface SitePostPick extends SiteProductSummary {
  rank: number;
  label: string;
  verdict: string;
  pros: string[];
  cons: string[];
}

export interface SitePostPage extends SitePostSummary {
  contract: number;
  updatedAt: string;
  blocks: SitePostBlock[];
  toc: { id: string; text: string }[];
  faq: SiteFaqItem[];
  picks: SitePostPick[];
  /** The picks side by side (same shape as the compare page), empty with fewer than two picks. */
  compare: SiteCompareResponse["groups"];
  keywords: string[];
  ctaText: string;
  schema: Record<string, unknown> | null;
  seo: { title?: string; description?: string };
  related: SitePostSummary[];
}

export interface SitePostsResponse {
  contract: number;
  posts: SitePostSummary[];
  total: number;
}

export interface SiteAuthorPage {
  contract: number;
  author: SiteAuthor;
  posts: SitePostSummary[];
}

export interface SiteSitemapResponse {
  contract: number;
  entries: { path: string; updatedAt: string }[];
}
