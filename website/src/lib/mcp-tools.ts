import "server-only";
import { getCategories, getIndustries, getNav, getPosts, getProduct, getSearch, getSettings } from "./api";
import { productMarkdown } from "./agent";
import type { SiteProductSummary } from "./contract";
import { SITE_URL } from "./defaults";
import { buildLlms } from "./llms";
import type { ToolResult } from "./mcp-rpc";
import { formatPrice } from "./price";

/** What each MCP tool does. Read tools use the same cached published data as the pages; request_quote is the only write. */

const text = (t: string, structured?: Record<string, unknown>): ToolResult => ({ content: [{ type: "text", text: t }], structuredContent: structured });
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const url = (p: string) => `${SITE_URL}${p}`;

const card = (p: SiteProductSummary) => {
  const price = p.priceMode === "public" ? formatPrice(p.price, p.currency) : null;
  return {
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category,
    part_number: p.mpn || null,
    price: price ? `${price} incl. 5% VAT` : null,
    price_note: price ? "Listed price, may change. Confirm on the product page or quote." : "On request: ask for a B2B quote.",
    availability: p.availability,
    url: url(`/products/${p.categorySlug}/${p.slug}`),
  };
};

const hits = new Map<string, number[]>();
function allow(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60 * 60_000);
  if (list.length >= 3) return false;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 2000) hits.clear();
  return true;
}

export async function runTool(name: string, args: Record<string, unknown>, ctx: { ip: string; host: string }): Promise<ToolResult> {
  switch (name) {
    case "search_products": {
      const q = str(args.query, 120);
      if (!q) throw new Error("query is required");
      const limit = Math.min(20, Math.max(1, Math.floor(Number(args.limit)) || 8));
      const { products } = await getSearch(q);
      const items = products.slice(0, limit).map(card);
      return text(items.length ? JSON.stringify(items, null, 2) : `No products matched "${q}". Try fewer words, a brand or a part number, or use find_guides.`, { products: items });
    }
    case "get_product": {
      const p = await getProduct(str(args.slug, 120));
      if (!p) throw new Error("No published product has that slug. Use search_products to find the right one.");
      return text(productMarkdown(p), { product: card(p) });
    }
    case "list_catalog": {
      const [cats, inds, nav] = await Promise.all([getCategories(), getIndustries(), getNav()]);
      const data = {
        categories: cats.categories.map((c) => ({ name: c.name, products: c.count, url: url(`/products/${c.slug}`) })),
        industries: inds.industries.map((i) => ({ name: i.name, summary: i.summary, url: url(`/industries/${i.slug}`) })),
        brands: nav.brands.map((b) => ({ name: b.name, url: url(`/brands/${b.slug}`) })),
      };
      return text(JSON.stringify(data, null, 2), data);
    }
    case "find_guides": {
      const q = str(args.query, 120);
      if (!q) throw new Error("query is required");
      const [found, all] = await Promise.all([getSearch(q), getPosts({})]);
      const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const extra = all.posts.filter((p) => words.some((w) => `${p.title} ${p.excerpt}`.toLowerCase().includes(w)));
      const seen = new Set<string>();
      const posts = [...found.posts, ...extra]
        .filter((p) => !seen.has(p.path) && seen.add(p.path))
        .slice(0, 10)
        .map((p) => ({ title: p.title, type: p.type, summary: p.excerpt, url: url(p.path) }));
      return text(posts.length ? JSON.stringify(posts, null, 2) : `No guide matched "${q}". Try list_catalog for industries, or search_products.`, { guides: posts });
    }
    case "get_company_info": {
      const full = await buildLlms(false);
      return text(full.split("\n## Products by category")[0]);
    }
    case "request_quote": {
      if (args.user_confirmed !== true) throw new Error("Not sent: the buyer has not explicitly agreed. Ask them, then call again with user_confirmed true.");
      const name = str(args.name, 120);
      const email = str(args.email, 200);
      if (name.length < 2) throw new Error("name is required");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email is required");
      if (!allow(ctx.ip)) throw new Error(`Too many requests from this network. Ask the buyer to use the form at ${url("/quote")}`);
      const base = process.env.PORTAL_INTERNAL_URL;
      const key = process.env.SITE_API_KEY;
      if (!base || !key) throw new Error(`Quote requests are unavailable right now. Use ${url("/quote")}`);
      const items = Array.isArray(args.items)
        ? args.items.slice(0, 30).flatMap((i) => {
            const o = i as Record<string, unknown>;
            const n = str(o.name, 200) || str(o.slug, 120);
            return n ? [{ slug: str(o.slug, 120) || undefined, name: n, qty: Math.min(10_000, Math.max(1, Math.floor(Number(o.qty)) || 1)) }] : [];
          })
        : [];
      const users = Math.floor(Number(args.users));
      const body = {
        name,
        company: str(args.company, 160),
        email,
        phone: str(args.phone, 40),
        users: users >= 1 ? Math.min(users, 100_000) : null,
        budget: "",
        timeline: "",
        notes: str(args.notes, 3000),
        industry: "",
        items,
        sourcePage: "/mcp",
        cta: "AI agent (MCP)",
        utm: {},
        landingPath: "",
        firstReferrer: "",
        visitorKey: "",
      };
      const res = await fetch(`${base.replace(/\/$/, "")}/api/site/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-site-key": key, "x-visitor-ip": ctx.ip, "x-site-host": ctx.host },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) throw new Error((data as { error?: string }).error ?? `The request could not be sent. Use ${url("/quote")}`);
      const { brand } = await getSettings();
      return text(`Sent. A ${brand.name} sales person will reply to ${email}, usually within one working day. No order was placed and nothing was charged.`, { ok: true });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
