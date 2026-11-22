import type { SiteCategoryPage, SiteIndustryPage, SiteBrandPage, SitePostPage, SiteProductPage, SiteProductSummary, SiteFaqItem } from "./contract";
import { SITE_URL } from "./defaults";
import { formatPrice } from "./price";

/**
 * Everything agents and AI assistants read that is not a normal page (website/SEO-AGENTIC.md): Markdown copies of
 * pages, the Link header, the API catalog, the MCP server card, the tool list and the Agent Skills index.
 * Pure functions only (no portal calls), so tests can run them; the routes and lib/mcp.ts do the fetching.
 */

const abs = (path: string) => `${SITE_URL}${path === "/" ? "" : path}`;

// ---------- asking for Markdown ----------

/** True when the request prefers text/markdown to text/html (Cloudflare "Markdown for Agents", RFC 9110 weights). */
export function acceptsMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;
  let md = -1;
  let html = -1;
  accept.split(",").forEach((part, i) => {
    const [type, ...params] = part.trim().toLowerCase().split(";");
    const q = Number(params.map((p) => p.trim()).find((p) => p.startsWith("q="))?.slice(2) ?? 1);
    const weight = Number.isFinite(q) ? q : 1;
    // earlier entries win a tie, so a browser's "text/html, ..., */*" never turns into Markdown
    if (type === "text/markdown" && md < 0) md = weight > 0 ? weight * 1000 - i : 0;
    if (type === "text/html" && html < 0) html = weight > 0 ? weight * 1000 - i : 0;
  });
  return md > 0 && md > html;
}

export type MarkdownRoute =
  | { kind: "home" }
  | { kind: "categories" }
  | { kind: "category"; slug: string }
  | { kind: "product"; slug: string; category: string }
  | { kind: "industries" }
  | { kind: "industry"; slug: string }
  | { kind: "brand"; slug: string }
  | { kind: "post"; slug: string; path: string };

/** Top-level paths that are application routes or files, never company pages ([page] posts). */
const NOT_PAGES = new Set(["api", "cart", "checkout", "account", "search", "quote", "contact", "brand", "mcp", "md", "compare", "media", "feed", "products", "industries", "brands", "guides", "blog", "services", "_next", "account", "order"]);

/** Which Markdown copy a site path has. null = the page has none (stays HTML only). */
export function markdownRoute(pathname: string): MarkdownRoute | null {
  const path = pathname.replace(/\.md$/, "").replace(/\/+$/, "");
  if (path === "" || path === "/index") return { kind: "home" };
  const parts = path.split("/").filter(Boolean);
  if (parts.some((p) => p.startsWith(".") || p.includes("."))) return null;
  const [a, b, c] = parts;
  if (parts.length === 1) {
    if (a === "products") return { kind: "categories" };
    if (a === "industries") return { kind: "industries" };
    return NOT_PAGES.has(a) ? null : { kind: "post", slug: a, path: `/${a}` };
  }
  if (a === "products" && parts.length === 2) return { kind: "category", slug: b };
  if (a === "products" && parts.length === 3) return { kind: "product", slug: c, category: b };
  if (a === "industries" && parts.length === 2) return { kind: "industry", slug: b };
  if (a === "brands" && parts.length === 2) return { kind: "brand", slug: b };
  if ((a === "guides" || a === "blog" || a === "services") && parts.length === 2) return { kind: "post", slug: b, path: `/${a}/${b}` };
  return null;
}

/** About four characters per token: what an agent reads in the `x-markdown-tokens` header to size its context. */
export const tokenEstimate = (text: string) => Math.ceil(text.length / 4);

// ---------- HTML → Markdown (the portal renders post and category bodies as HTML) ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? m)));
const strip = (s: string) => s.replace(/<[^>]+>/g, "");
const cell = (s: string) => decode(strip(s)).replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();

/** Small and forgiving: enough for the headings, paragraphs, lists, links and tables the portal's Markdown renderer makes. */
export function htmlToMarkdown(html: string): string {
  let s = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => cell(c[1])));
    if (!rows.length || !rows[0].length) return "";
    const width = rows[0].length;
    const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
    return `\n\n${[line(rows[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n")}\n\n`;
  });
  s = s
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "_$2_")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n: string, t: string) => `\n\n${"#".repeat(Number(n))} ${strip(t).replace(/\s+/g, " ").trim()}\n\n`)
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, t: string) => {
      const text = strip(t).replace(/\s+/g, " ").trim();
      if (!text) return "";
      const url = href.startsWith("/") ? `${SITE_URL}${href}` : href;
      return /^(https?:|mailto:|tel:)/.test(url) ? `[${text}](${url})` : text;
    })
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|ul|ol|blockquote|section|article)>/gi, "\n\n")
    .replace(/<blockquote[^>]*>/gi, "\n\n> ");
  s = decode(strip(s));
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^(- [^\n]*)\n\n(?=- )/gm, "$1\n")
    .replace(/^(- [^\n]*)\n\n(?=- )/gm, "$1\n")
    .trim();
}

// ---------- Markdown copies ----------

const AVAILABILITY = { in_stock: "in stock in the UAE", ships_soon: "ships in 2–5 days", on_order: "on order, date confirmed on the quote" } as const;
const line = (label: string, value: string | false | null | undefined) => (value ? `- ${label}: ${value}` : null);
const faqLines = (faq: SiteFaqItem[]) => (faq.length ? ["", "## Frequently asked questions", "", ...faq.flatMap((f) => [`**${f.q}**`, "", f.a, ""])] : []);
const join = (lines: (string | null | false | undefined)[]) => `${lines.filter((l) => typeof l === "string").join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;

const priceText = (p: Pick<SiteProductSummary, "priceMode" | "price" | "currency">) => {
  const price = p.priceMode === "public" ? formatPrice(p.price, p.currency) : null;
  return price ? `${price} incl. 5% VAT` : "on request (ask for a B2B quote)";
};
const productUrl = (p: Pick<SiteProductSummary, "categorySlug" | "slug">) => abs(`/products/${p.categorySlug}/${p.slug}`);
const productItem = (p: SiteProductSummary) => `[${p.name}](${productUrl(p)})`;

export function productMarkdown(p: SiteProductPage): string {
  const warranty = p.uae.warranty || p.brandWarrantyNote || "";
  return join([
    `# ${p.name}`,
    "",
    `Source: ${productUrl(p)}`,
    "",
    line("Brand", p.brand),
    line("Category", p.category),
    line("Part number", p.mpn),
    `- Price: ${priceText(p)}`,
    line("Availability", p.priceMode === "public" ? AVAILABILITY[p.availability] : AVAILABILITY.in_stock),
    line("Keyboard", p.uae.keyboard),
    line("Warranty", warranty),
    `- Get B2B pricing: ${abs(`/quote?product=${p.slug}`)}`,
    p.summaryHtml ? "" : null,
    p.summaryHtml ? htmlToMarkdown(p.summaryHtml) : null,
    p.highlights.length ? "" : null,
    p.highlights.length ? "## Highlights" : null,
    p.highlights.length ? "" : null,
    ...p.highlights.map((h) => `- ${h}`),
    ...p.specGroups.flatMap((g) => ["", `## ${g.label}`, "", "| Specification | Value |", "| --- | --- |", ...g.rows.map((r) => `| ${cell(r.label)} | ${cell(r.value)} |`)]),
    p.pros.length ? "" : null,
    p.pros.length ? "## Pros" : null,
    p.pros.length ? "" : null,
    ...p.pros.map((x) => `- ${x}`),
    p.cons.length ? "" : null,
    p.cons.length ? "## Cons" : null,
    p.cons.length ? "" : null,
    ...p.cons.map((x) => `- ${x}`),
    ...faqLines(p.faq),
  ]);
}

export function categoryMarkdown(c: SiteCategoryPage): string {
  return join([
    `# ${c.name}`,
    "",
    `Source: ${abs(`/products/${c.slug}`)}`,
    "",
    c.summary,
    "",
    "## Products",
    "",
    ...c.products.map((p) => `- ${productItem(p)}${p.mpn ? ` · ${p.mpn}` : ""} · ${priceText(p)}`),
    c.introHtml ? "" : null,
    c.introHtml ? htmlToMarkdown(c.introHtml) : null,
    ...faqLines(c.faq),
  ]);
}

export function industryMarkdown(i: SiteIndustryPage): string {
  return join([
    `# ${i.heroTitle || `IT for ${i.name}`}`,
    "",
    `Source: ${abs(`/industries/${i.slug}`)}`,
    "",
    i.summary,
    i.introHtml ? "" : null,
    i.introHtml ? htmlToMarkdown(i.introHtml) : null,
    i.painPoints.length ? "" : null,
    i.painPoints.length ? "## What goes wrong" : null,
    i.painPoints.length ? "" : null,
    ...i.painPoints.map((x) => `- ${x}`),
    i.roles.length ? "" : null,
    i.roles.length ? "## What each role needs" : null,
    i.roles.length ? "" : null,
    ...i.roles.map((r) => `- ${r.role}: ${r.needs}`),
    i.products.length ? "" : null,
    i.products.length ? "## Recommended models" : null,
    i.products.length ? "" : null,
    ...i.products.map((p) => `- ${productItem(p)}${p.role ? ` (${p.role})` : ""} · ${priceText(p)}`),
    ...faqLines(i.faq),
  ]);
}

export function brandMarkdown(b: SiteBrandPage): string {
  return join([`# ${b.name}`, "", `Source: ${abs(`/brands/${b.slug}`)}`, "", b.uaeWarrantyNote, "", "## Products", "", ...b.products.map((p) => `- ${productItem(p)} · ${priceText(p)}`)]);
}

export function postMarkdown(p: SitePostPage): string {
  const by = p.author ? `By ${p.author.name}${p.author.jobTitle ? `, ${p.author.jobTitle}` : ""}. ` : "";
  return join([
    `# ${p.title}`,
    "",
    `Source: ${abs(p.path)}`,
    "",
    `${by}Published ${p.publishedAt.slice(0, 10)}. Updated ${p.updatedAt.slice(0, 10)}.`,
    p.excerpt ? "" : null,
    p.excerpt ? `> ${p.excerpt}` : null,
    "",
    ...p.blocks.flatMap((b) => (b.kind === "html" ? [htmlToMarkdown(b.html), ""] : b.kind === "product" ? [`- ${productItem(b.product)} · ${priceText(b.product)}`, ""] : b.kind === "cta" ? [`Get B2B pricing: ${abs("/quote")}`, ""] : [])),
    p.picks.length ? "## Our picks" : null,
    p.picks.length ? "" : null,
    ...p.picks.map((x) => `${x.rank}. ${productItem(x)}: ${[x.label, x.verdict].filter(Boolean).join(". ")}`),
    ...faqLines(p.faq),
  ]);
}

export function indexMarkdown(title: string, source: string, rows: { name: string; path: string; note?: string }[]): string {
  return join([`# ${title}`, "", `Source: ${abs(source)}`, "", ...rows.map((r) => `- [${r.name}](${abs(r.path)})${r.note ? `: ${r.note}` : ""}`)]);
}

// ---------- discovery ----------

/** Header on every page: where an agent finds the sitemap, the llms.txt brief, and the catalog of machine-readable endpoints. */
export function linkHeader(): string {
  return [
    `<${abs("/sitemap.xml")}>; rel="sitemap"`,
    `<${abs("/llms.txt")}>; rel="describedby"; type="text/plain"`,
    `<${abs("/.well-known/api-catalog")}>; rel="api-catalog"`,
  ].join(", ");
}

/** RFC 9727 API catalog: one linkset entry for the MCP endpoint, pointing at its description and its docs. */
export function apiCatalog() {
  return {
    linkset: [
      {
        anchor: abs("/mcp"),
        "service-desc": [{ href: abs("/.well-known/mcp/server-card.json"), type: "application/json" }],
        "service-doc": [{ href: abs("/llms.txt"), type: "text/plain" }],
        status: [{ href: abs("/api/health"), type: "application/json" }],
      },
      {
        anchor: abs("/feed/google.xml"),
        "service-doc": [{ href: abs("/llms.txt"), type: "text/plain" }],
      },
    ],
  };
}

export const MCP_PROTOCOL = "2025-06-18";

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint?: boolean };
}

const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

export const mcpTools: McpTool[] = [
  {
    name: "search_products",
    title: "Search products",
    description: "Search the Zeronix Tech catalog of business laptops, desktops, workstations, servers and accessories by words, brand, model or part number. Returns name, part number, price (AED incl. 5% VAT, or on request), availability and page URL.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Words, brand, model or part number, e.g. 'ThinkPad X1 Carbon' or '21V7006FUS'." }, limit: { type: "integer", minimum: 1, maximum: 20, description: "Maximum results (default 8)." } }, required: ["query"], additionalProperties: false },
    annotations: READ,
  },
  {
    name: "get_product",
    title: "Get a product",
    description: "Full details of one product by its slug (from search_products): specifications, price, availability, keyboard and warranty notes, FAQ. Quote the price only as listed and say it can change.",
    inputSchema: { type: "object", properties: { slug: { type: "string", description: "Product slug, the last part of its URL." } }, required: ["slug"], additionalProperties: false },
    annotations: READ,
  },
  {
    name: "list_catalog",
    title: "List categories, industries and brands",
    description: "The product categories, the industries Zeronix Tech equips and the brands it sells, with their page URLs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ,
  },
  {
    name: "find_guides",
    title: "Find buying guides",
    description: "Search buying guides, comparisons, articles and IT service pages (for example 'laptops for architects'). Returns title, summary and URL.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Topic or industry." } }, required: ["query"], additionalProperties: false },
    annotations: READ,
  },
  {
    name: "get_company_info",
    title: "Company, delivery and ordering facts",
    description: "Who Zeronix Tech is, how to contact it, how ordering, VAT invoices, delivery and warranty work, and what an assistant may and may not promise.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ,
  },
  {
    name: "request_quote",
    title: "Request a B2B quote",
    description:
      "Send a quote request to the Zeronix Tech sales team on behalf of a buyer. Call it ONLY after the buyer has given their name and email and has explicitly agreed to send these details; set user_confirmed to true only then. A person replies by email, usually within one working day. Does not place an order or take payment.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Buyer's full name." },
        email: { type: "string", description: "Buyer's email address." },
        company: { type: "string" },
        phone: { type: "string" },
        users: { type: "integer", minimum: 1, description: "Number of people or machines." },
        items: { type: "array", items: { type: "object", properties: { slug: { type: "string" }, name: { type: "string" }, qty: { type: "integer", minimum: 1 } }, required: ["name", "qty"] }, description: "Products wanted; use slugs from search_products." },
        notes: { type: "string", description: "Requirements, budget, timeline." },
        user_confirmed: { type: "boolean", description: "True only if the buyer explicitly agreed to send this request." },
      },
      required: ["name", "email", "user_confirmed"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
];

/** MCP server card (SEP-1649), served at /.well-known/mcp/server-card.json so clients find the server without being told. */
export function serverCard(brandName: string) {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    version: "1.0",
    protocolVersion: MCP_PROTOCOL,
    serverInfo: { name: "zeronixtech", title: brandName, version: "1.0.0" },
    description: `${brandName} is a business IT supplier in the UAE. Search laptops, desktops, workstations and servers with UAE prices and part numbers, read buying guides by industry, and send a B2B quote request.`,
    documentationUrl: abs("/llms.txt"),
    transport: { type: "streamable-http", endpoint: "/mcp" },
    capabilities: { tools: { listChanged: false } },
    authentication: { required: false },
    tools: mcpTools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema })),
  };
}

// ---------- Agent Skills (Cloudflare Agent Skills discovery) ----------

export const SKILL_NAME = "buy-business-it";
const SKILL_PATH = `/.well-known/agent-skills/${SKILL_NAME}/SKILL.md`;

export function agentSkillText(brandName: string): string {
  return `---
name: ${SKILL_NAME}
description: Find and shortlist business laptops, desktops, workstations and servers for a UAE company, read industry buying guides, and send a B2B quote request to ${brandName} (zeronixtech.com).
---

# Buy business IT in the UAE with ${brandName}

Use this when someone in the UAE needs business computers for a team, wants to know which model suits a role or industry, or wants B2B pricing.

## Steps

1. Ask for the industry, the roles, the team size and any budget or part number. Do not ask for more than you need.
2. Look up the catalog. Fastest is the MCP server at ${SITE_URL}/mcp (tools: search_products, get_product, list_catalog, find_guides, get_company_info). Without MCP, use ${SITE_URL}/search?q={words} or send \`Accept: text/markdown\` to any page (or add \`.md\` to its URL) to get a clean Markdown copy.
3. For "which laptop for my team", read the matching guide first: ${SITE_URL}/guides and ${SITE_URL}/industries/{industry}. Name specific models and link their product pages.
4. Give the price only as listed on the product page, in AED including 5% VAT, and say it was the listed price on that date and may change. Products marked "on request" are priced by quote.
5. To get volume pricing, use the request_quote tool or open ${SITE_URL}/quote?product={slug}. Send it only after the buyer has given their name and email and explicitly agreed.

## Rules

- Never invent a price, stock level, delivery date, discount or warranty length. These depend on the part number and quantity and are confirmed on the quote.
- Middle East part numbers carry the maker's local warranty; US part numbers may not. Tell the buyer to confirm the exact part number, keyboard layout and warranty on the quote.
- Do not create accounts, place orders or submit forms without the buyer's explicit confirmation, and share only the details they agreed to send.
- Link the exact page you used so the buyer sees the current price and stock.
`;
}

const sha256 = async (text: string) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).toString("hex");

export async function skillIndex(brandName = "Zeronix Tech") {
  return {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: SKILL_NAME,
        type: "skill-md",
        description: `Find and shortlist business IT for a UAE company and request B2B pricing from ${brandName}.`,
        url: SKILL_PATH,
        digest: `sha256:${await sha256(agentSkillText(brandName))}`,
      },
    ],
  };
}
