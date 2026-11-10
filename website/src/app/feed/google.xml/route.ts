import { getLlms, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";
import { merchantFeed } from "@/lib/merchant-feed";

/** Google Merchant Center feed: add https://zeronixtech.com/feed/google.xml as a scheduled fetch (daily). */
export async function GET() {
  const [{ products }, { brand }] = await Promise.all([getLlms(), getSettings()]);
  return new Response(merchantFeed(products, { url: SITE_URL, name: brand.name, tagline: brand.tagline }), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=600", "X-Robots-Tag": "noindex" },
  });
}

export const revalidate = 600;
