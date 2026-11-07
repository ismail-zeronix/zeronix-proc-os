import type { MetadataRoute } from "next";

/**
 * The portal is private: no search engine should crawl it. Blocking /widget/ and /api/ also keeps well-behaved crawlers
 * (Google, Bing) from loading the chat widget when they render the company website, so they never start a chat.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
