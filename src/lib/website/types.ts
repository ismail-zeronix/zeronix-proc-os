/** Shapes stored in the site_* jsonb columns (WEBSITE-PLAN.md section 5). No imports: schema.ts and the site API share them. */

export interface SiteFaq {
  q: string;
  a: string;
}

/** Search engine fields an editor can override; empty = built from the record. */
export interface SiteSeo {
  title?: string;
  description?: string;
  /** Extra JSON-LD merged into the page's own. */
  schema?: Record<string, unknown>;
  noindex?: boolean;
}

export interface SiteImage {
  fileId: number;
  alt: string;
  /** Where the picture came from (brand press kit, our photo), for image rights. */
  source?: string;
}

/** One person who works in an industry and what their machine must do ("Agent: light, long battery, 14-inch"). */
export interface SiteIndustryRole {
  role: string;
  needs: string;
  /** Category slugs worth recommending to this role. */
  categories: string[];
}

/** Which spec groups and fields a category shows, compares and filters on. */
export interface SiteSpecTemplate {
  groups: { label: string; fields: { key: string; label: string; filter?: boolean }[] }[];
}

/** UAE details a corporate buyer asks about. */
export interface SiteUaeNotes {
  keyboard?: string;
  warranty?: string;
  region?: string;
}

/** A pick inside a guide or comparison: points at a product and says why it is there. */
export interface SitePostProduct {
  productId: number;
  rank: number;
  label: string;
  verdict: string;
  pros: string[];
  cons: string[];
}

/** One line of the SEO checklist shown on a draft. */
export interface SiteCheck {
  key: string;
  label: string;
  level: "ok" | "warn" | "fail";
  detail?: string;
}

export interface SiteQuoteItem {
  productId?: number;
  name: string;
  qty: number;
}

export interface SiteUtm {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}
