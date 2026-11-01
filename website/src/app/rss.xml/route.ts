import { getPosts, getSettings } from "@/lib/api";
import { SITE_URL } from "@/lib/defaults";

const ENTITIES: Record<string, string> = { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" };
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ENTITIES[c]);

/** RSS of the latest guides and posts, for feed readers and newsletters. */
export async function GET() {
  const [{ posts }, { brand }] = await Promise.all([getPosts({}), getSettings()]);
  const items = posts
    .map(
      (p) =>
        `<item><title>${esc(p.title)}</title><link>${SITE_URL}${p.path}</link><guid>${SITE_URL}${p.path}</guid><pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`,
    )
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(brand.name)}</title><link>${SITE_URL}</link><description>${esc(brand.tagline)}</description><language>en-ae</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}

export const revalidate = 600;
