import type { SiteLlmsResponse } from "./contract";

/**
 * Google Merchant Center product feed (RSS 2.0 with the g: namespace) for free listings in Google Shopping, where
 * Microless, Sharaf DG and Noon show today (website/SEO-STRATEGY.md). Only products with a public price, a picture and
 * stock we can promise; "price on request" products have nothing to list. Shipping and returns are set once in Merchant
 * Center, not per item. Pure, so tests/website-seo.test.ts can check it.
 */

type FeedProduct = SiteLlmsResponse["products"][number];

const ENTITIES: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" };
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ENTITIES[c]);

/** Google's taxonomy, only where the match is certain; Google classifies the rest itself. */
const GOOGLE_CATEGORY: Record<string, string> = {
  laptops: "Electronics > Computers > Laptops",
  gaming: "Electronics > Computers > Laptops",
  desktops: "Electronics > Computers > Desktop Computers",
  workstations: "Electronics > Computers > Desktop Computers",
};

/** Item ids may be 50 characters at most: long slugs keep their start plus a short stable hash. */
export function feedId(slug: string): string {
  if (slug.length <= 50) return slug;
  let h = 5381;
  for (const c of slug) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return `${slug.slice(0, 41)}-${h.toString(36).slice(0, 8)}`;
}

export function feedItems(products: FeedProduct[]): FeedProduct[] {
  return products.filter((p) => p.priceMode === "public" && Number(p.price) > 0 && p.image?.src && p.availability !== "on_order");
}

export function merchantFeed(products: FeedProduct[], site: { url: string; name: string; tagline: string }): string {
  const items = feedItems(products)
    .map((p) => {
      const description = [...p.highlights, ...p.keySpecs].filter(Boolean).join(". ") || p.name;
      const fields = [
        ["g:id", feedId(p.slug)],
        ["g:title", p.name.slice(0, 150)],
        ["g:description", description.slice(0, 5000)],
        ["g:link", `${site.url}${p.path}`],
        ["g:image_link", `${site.url}${p.image!.src}`],
        ["g:availability", "in_stock"],
        ["g:price", `${Number(p.price).toFixed(2)} ${p.currency || "AED"}`],
        ["g:condition", "new"],
        ["g:brand", p.brand],
        ["g:mpn", p.mpn],
        // no GTINs in our data: brand + part number identify the item; without a part number say so
        ["g:identifier_exists", p.brand && p.mpn ? "" : "no"],
        ["g:product_type", p.category],
        ["g:google_product_category", GOOGLE_CATEGORY[p.categorySlug] ?? ""],
      ].filter(([, v]) => v);
      return `<item>${fields.map(([k, v]) => `<${k}>${esc(String(v))}</${k}>`).join("")}</item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${esc(site.name)}</title><link>${site.url}</link><description>${esc(site.tagline)}</description>\n${items}\n</channel></rss>`;
}
