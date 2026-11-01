import { faqList, parseMarkdownFile, renderMarkdown, slugify, str, strList } from "./markdown";
import type { SiteCheck, SiteFaq, SiteImage, SitePostProduct } from "./types";

/**
 * Guides, comparisons and articles from claude-seo / Claude Blog (WEBSITE-PLAN.md section 6): reading the .md, the SEO
 * checklist, and the shortcodes. No database here, so all of it is unit-tested (tests/website.test.ts).
 */

export const POST_TYPES = ["guide", "comparison", "article", "industry_page", "page"] as const;
export type PostType = (typeof POST_TYPES)[number];

export interface PostInput {
  type: PostType;
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  body: string;
  primaryKeyword: string;
  keywords: string[];
  category: string;
  tags: string[];
  industryId: number | null;
  categoryId: number | null;
  products: SitePostProduct[];
  faq: SiteFaq[];
  schema: Record<string, unknown> | null;
  cover: SiteImage | null;
  ctaText: string;
  authorUserId: number | null;
  reviewNotes: string;
}

export interface PostLookup {
  industries: { id: number; slug: string }[];
  categories: { id: number; slug: string; name: string }[];
  products: { id: number; slug: string; mpn: string }[];
}

/** Where a post lives on the site: guides and comparisons under /guides, articles under /blog. */
/** Company pages (about, contact, privacy...) sit at the root; articles under /blog; everything else under /guides. */
export const postPath = (type: string, slug: string) => (type === "page" ? `/${slug}` : type === "article" ? `/blog/${slug}` : `/guides/${slug}`);

/**
 * Reads a post .md. `cover` and image paths inside the body are left as written (e.g. images/cover.webp); the upload
 * step swaps them for uploaded files. Unknown products, industries and categories become warnings, not errors.
 */
export function postFromMarkdown(text: string, lookup: PostLookup): { input: PostInput; coverPath: string; coverAlt: string; warnings: string[] } {
  const { data, body } = parseMarkdownFile(text);
  const warnings: string[] = [];
  const title = str(data.title ?? data.name, 160);
  if (!title) throw new Error("The file has no title: add `title:` to the front matter");
  const rawType = str(data.type || "article").toLowerCase().replace(/[\s-]+/g, "_");
  if (rawType === "product") throw new Error("This file is a product. Upload it under Catalog › Products.");
  const type: PostType = (POST_TYPES as readonly string[]).includes(rawType) ? (rawType as PostType) : "article";
  if (rawType && rawType !== type) warnings.push(`Type "${rawType}" is not known; saved as an article.`);

  const industrySlug = slugify(str(data.industry));
  const industry = lookup.industries.find((i) => i.slug === industrySlug);
  if (industrySlug && !industry) warnings.push(`Industry "${industrySlug}" is not in the catalog.`);
  const categoryRaw = str(data.category, 80);
  const category = categoryRaw ? lookup.categories.find((c) => c.slug === slugify(categoryRaw) || c.name.toLowerCase() === categoryRaw.toLowerCase()) : undefined;

  const products: SitePostProduct[] = [];
  if (Array.isArray(data.products)) {
    for (const [i, raw] of (data.products as unknown[]).entries()) {
      const o = (raw && typeof raw === "object" ? raw : { product: raw }) as Record<string, unknown>;
      const ref = str(o.mpn ?? o.slug ?? o.product, 120);
      const p = lookup.products.find((x) => (x.mpn && x.mpn.toLowerCase() === ref.toLowerCase()) || x.slug === slugify(ref));
      if (!p) {
        if (ref) warnings.push(`Product "${ref}" is not in the catalog yet; add it under Products (or upload its .md), then upload this file again.`);
        continue;
      }
      products.push({ productId: p.id, rank: i + 1, label: str(o.label, 60), verdict: str(o.verdict, 600), pros: strList(o.pros, 6), cons: strList(o.cons, 6) });
    }
  }

  let schema: Record<string, unknown> | null = null;
  if (data.schema && typeof data.schema === "object" && !Array.isArray(data.schema)) schema = data.schema as Record<string, unknown>;

  return {
    warnings,
    coverPath: str(data.cover ?? data.image ?? data.coverimage, 300),
    coverAlt: str(data.coveralt ?? data.imagealt, 300),
    input: {
      type,
      slug: slugify(str(data.slug) || title),
      title,
      metaTitle: str(data.metatitle ?? data.seotitle, 90),
      metaDescription: str(data.metadescription ?? data.description, 300),
      excerpt: str(data.excerpt ?? data.summary, 400),
      body,
      primaryKeyword: str(data.primarykeyword ?? data.focuskeyword ?? data.keyword, 120),
      keywords: strList(data.keywords ?? data.secondarykeywords, 20),
      category: category?.name ?? categoryRaw,
      tags: strList(data.tags, 12),
      industryId: industry?.id ?? null,
      categoryId: category?.id ?? null,
      products,
      faq: faqList(data.faq ?? data.faqs),
      schema,
      cover: null,
      ctaText: str(data.cta ?? data.ctatext, 120),
      authorUserId: null,
      reviewNotes: "",
    },
  };
}

// ---------- shortcodes ----------

/**
 * Shortcodes on a line of their own: {{product:slug-or-part-number}}, {{compare}} (the picks side by side) and
 * {{cta}} or {{cta:Button text}}. They are rendered as live components by the site, so the HTML keeps a marker
 * paragraph (@@sc:kind:arg@@) that survives sanitising and is split out by the site API.
 */
const SHORTCODE = /^\{\{\s*(product|compare|cta)\s*(?::\s*([^}]*?))?\s*\}\}$/gm;
export const MARKER = /<p>@@sc:(product|compare|cta):([^@]*)@@<\/p>/g;

export function renderPostBody(body: string): string {
  return renderMarkdown(body.replace(SHORTCODE, (_, kind: string, arg = "") => `@@sc:${kind}:${encodeURIComponent(arg.trim())}@@`));
}

export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 220));
}

/** The H2s of the rendered body, for the table of contents. */
export function tocOf(html: string): { id: string; text: string }[] {
  return [...html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map((m) => ({ id: m[1], text: m[2].replace(/<[^>]+>/g, "") }));
}

// ---------- SEO checklist ----------

/**
 * The checklist on every draft (WEBSITE-PLAN.md section 6). `known` holds the site's existing paths so internal links
 * can be checked; `slugTaken` is true when another post already uses this slug.
 */
export function seoChecks(p: PostInput, ctx: { known: Set<string>; slugTaken: boolean }): SiteCheck[] {
  const checks: SiteCheck[] = [];
  const add = (key: string, label: string, level: SiteCheck["level"], detail?: string) => checks.push({ key, label, level, detail });
  const title = p.metaTitle || p.title;
  const words = p.body.split(/\s+/).filter(Boolean).length;
  const kw = p.primaryKeyword.toLowerCase();
  const html = renderMarkdown(p.body);
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").toLowerCase());

  add("title", "Title length", title.length <= 60 ? "ok" : title.length <= 70 ? "warn" : "fail", `${title.length} characters (aim for 60 or fewer)`);
  const d = p.metaDescription.length;
  add("meta", "Meta description", d >= 120 && d <= 160 ? "ok" : d === 0 ? "fail" : "warn", d ? `${d} characters (aim for 120–160)` : "Missing");
  add("slug", "Web address", ctx.slugTaken ? "fail" : /^[a-z0-9-]{3,80}$/.test(p.slug) ? "ok" : "warn", ctx.slugTaken ? `Another post already uses /${p.slug}` : `/${p.slug}`);

  // company pages (about, privacy...) are not written to rank for a keyword
  if (p.type === "page") {
    /* no keyword check */
  } else if (!kw) add("keyword", "Primary keyword", "warn", "Not set");
  else {
    const first100 = p.body.split(/\s+/).slice(0, 100).join(" ").toLowerCase();
    const missing = [
      !title.toLowerCase().includes(kw) && "title",
      !p.metaDescription.toLowerCase().includes(kw) && "meta description",
      !first100.includes(kw) && "first 100 words",
      !h2s.some((h) => h.includes(kw)) && "an H2",
    ].filter(Boolean);
    add("keyword", `Keyword "${p.primaryKeyword}"`, missing.length === 0 ? "ok" : missing.length <= 2 ? "warn" : "fail", missing.length ? `Not in the ${missing.join(", ")}` : "In the title, description, opening and an H2");
  }

  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  add("h1", "Headings", h1 === 0 && h2s.length >= 2 ? "ok" : h1 > 0 ? "fail" : "warn", h1 > 0 ? "Remove the H1 from the body: the title is the page's H1" : `${h2s.length} H2 sections`);

  const minWords = p.type === "page" ? 150 : p.type === "article" ? 600 : 1000;
  add("length", "Length", words >= minWords ? "ok" : words >= minWords / 2 ? "warn" : "fail", `${words} words (${minWords}+ for a ${p.type === "page" ? "page" : p.type === "article" ? "post" : "guide"})`);

  const images = [...p.body.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)];
  const noAlt = images.filter((m) => !m[1].trim()).length;
  add("alt", "Image descriptions", noAlt ? "fail" : "ok", images.length ? (noAlt ? `${noAlt} of ${images.length} images have no alt text` : `${images.length} images, all described`) : "No images in the text");
  if (p.type !== "page") add("cover", "Cover picture", p.cover ? "ok" : "warn", p.cover ? undefined : "No cover: social shares and cards show a placeholder");

  // page links only: an image is ![alt](src), and uploaded pictures live under /media/
  const links = [...p.body.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !u.startsWith("/media/"));
  const internal = links.filter((u) => u.startsWith("/"));
  const broken = internal.filter((u) => !ctx.known.has(u.split(/[?#]/)[0].replace(/\/$/, "") || "/"));
  add("links", "Internal links", internal.length >= 2 && !broken.length ? "ok" : broken.length ? "fail" : "warn", broken.length ? `Not found on the site: ${broken.slice(0, 4).join(", ")}` : `${internal.length} links to other pages (aim for 2+)`);
  const insecure = links.filter((u) => u.startsWith("http:"));
  if (insecure.length) add("http", "Insecure links", "warn", `${insecure.length} link(s) use http://`);

  if (p.type !== "article" && p.type !== "page") {
    add("faq", "FAQ", p.faq.length >= 3 ? "ok" : "warn", `${p.faq.length} questions (3+ helps search and AI answers)`);
    if (p.type === "guide" || p.type === "comparison") add("picks", "Products", p.products.length ? "ok" : "warn", p.products.length ? `${p.products.length} models linked` : "No models linked from the catalog");
  }
  return checks;
}
