import { getBrand, getCategories, getCategory, getIndustries, getIndustry, getPost, getProduct } from "@/lib/api";
import { brandMarkdown, categoryMarkdown, indexMarkdown, industryMarkdown, markdownRoute, postMarkdown, productMarkdown, tokenEstimate } from "@/lib/agent";
import { buildLlms } from "@/lib/llms";

/**
 * Markdown copies of pages for agents (website/SEO-AGENTIC.md). The proxy sends a request here when it asks for
 * `Accept: text/markdown`, or ends in `.md`; people never see this route. Same published data as the HTML pages.
 */
export async function GET(_req: Request, ctx: RouteContext<"/md/[[...path]]">) {
  const { path = [] } = await ctx.params;
  const route = markdownRoute(`/${path.join("/")}`);
  if (!route) return reply("# Not found\n", 404);

  let text: string | null = null;
  try {
    switch (route.kind) {
      case "home":
        text = await buildLlms(false);
        break;
      case "categories":
        text = indexMarkdown("Products by category", "/products", (await getCategories()).categories.map((c) => ({ name: c.name, path: `/products/${c.slug}`, note: `${c.summary ? `${c.summary} ` : ""}(${c.count} products)` })));
        break;
      case "category": {
        const c = await getCategory(route.slug);
        text = c && categoryMarkdown(c);
        break;
      }
      case "product": {
        const p = await getProduct(route.slug);
        // one address per product: a wrong category is the same page, as on the HTML side
        text = p && productMarkdown(p);
        break;
      }
      case "industries":
        text = indexMarkdown("IT by industry", "/industries", (await getIndustries()).industries.map((i) => ({ name: i.name, path: `/industries/${i.slug}`, note: i.summary })));
        break;
      case "industry": {
        const i = await getIndustry(route.slug);
        text = i && industryMarkdown(i);
        break;
      }
      case "brand": {
        const b = await getBrand(route.slug);
        text = b && brandMarkdown(b);
        break;
      }
      case "post": {
        const p = await getPost(route.slug);
        // /guides/x and /blog/x are one article with one address: only the real path has a copy
        text = p && p.path === route.path ? postMarkdown(p) : null;
        break;
      }
    }
  } catch {
    return reply("# Temporarily unavailable\n\nThe catalog could not be reached. Try again in a moment.\n", 503);
  }
  return text ? reply(text, 200) : reply("# Not found\n", 404);
}

function reply(text: string, status: number) {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "x-markdown-tokens": String(tokenEstimate(text)),
      Vary: "Accept",
      "Cache-Control": status === 200 ? "public, max-age=300" : "no-store",
      "Content-Signal": "search=yes, ai-input=yes, ai-train=yes",
      // the HTML page is the one to rank; this copy is for agents
      "X-Robots-Tag": "noindex",
    },
  });
}

export const revalidate = 600;
