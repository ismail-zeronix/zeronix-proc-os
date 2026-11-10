import type { SiteBrand } from "./contract";
import { SITE_URL } from "./defaults";

/**
 * Search and AI-assistant settings shared by robots.txt, llms.txt, the layout and IndexNow (website/SEO-PLAN.md).
 */

/** The company's profiles from Website › Settings (schema.org sameAs). */
export const profileLinks = (brand: SiteBrand) => (brand.profiles ?? "").split(/\s+/).filter((u) => /^https:\/\/\S+$/.test(u));

/**
 * Crawlers named one by one in robots.txt, so the policy for each is deliberate (a crawler that finds its own group
 * ignores the `*` group, so every group repeats the same rules). Search bots decide whether an assistant can cite us,
 * training bots whether a model learns the brand, user agents fetch a page someone asked about.
 */
export const AI_CRAWLERS = {
  search: ["Googlebot", "Bingbot", "OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Applebot", "DuckAssistBot", "YandexBot"],
  training: ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "meta-externalagent", "Amazonbot", "CCBot", "cohere-ai"],
  user: ["ChatGPT-User", "Claude-User", "Perplexity-User", "MistralAI-User"],
};

/** Pages with no value in search: carts, accounts, internal search results, the hidden style guide. */
export const PRIVATE_PATHS = ["/api/", "/cart", "/checkout", "/account", "/search", "/brand$"];

const DAYS: Record<string, string> = { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun" };

/** "Mo-Sa 09:00-19:00" (schema.org form, as entered in Settings) → "Mon–Sat 09:00–19:00" for people. */
export const readableHours = (hours: string) => hours.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (d) => DAYS[d]).replace(/(\w)-(\w)/g, "$1–$2");

/**
 * Organization + WebSite structured data for every page: who runs the site and how to search it. Once Settings has the
 * opening hours or the Google Maps link (a real office people can visit), the organisation is also a ComputerStore, the
 * local-business type Google Maps and AI assistants match to "computer shop in Dubai" (claude-seo seo-local).
 */
export function siteJsonLd(brand: SiteBrand) {
  const sameAs = profileLinks(brand);
  const local = Boolean(brand.hours || brand.mapUrl);
  const org = {
    "@type": local ? ["Organization", "OnlineStore", "ComputerStore"] : ["Organization", "OnlineStore"],
    "@id": `${SITE_URL}/#organization`,
    name: brand.name,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    image: `${SITE_URL}/opengraph-image`,
    description: `${brand.tagline} ${brand.subline}`.trim(),
    slogan: brand.tagline,
    email: brand.email || undefined,
    telephone: brand.phone || undefined,
    address: brand.address ? { "@type": "PostalAddress", streetAddress: brand.address, addressLocality: "Dubai", addressCountry: "AE" } : undefined,
    areaServed: { "@type": "Country", name: "United Arab Emirates" },
    currenciesAccepted: "AED",
    contactPoint: brand.phone || brand.email ? [{ "@type": "ContactPoint", contactType: "sales", telephone: brand.phone || undefined, email: brand.email || undefined, areaServed: "AE", availableLanguage: ["English"] }] : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    openingHours: brand.hours ? brand.hours.split(/\s*[,;]\s*/).filter(Boolean) : undefined,
    hasMap: brand.mapUrl || undefined,
    priceRange: local ? "AED" : undefined,
  };
  const site = {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: brand.name,
    url: SITE_URL,
    inLanguage: "en-AE",
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" },
  };
  return { "@context": "https://schema.org", "@graph": [org, site] };
}
