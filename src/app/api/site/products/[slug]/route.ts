import { publicProduct } from "@/lib/website/site-catalog";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** A product page: specs by template group, UAE notes, best-for industries, related products. */
export async function GET(req: Request, ctx: RouteContext<"/api/site/products/[slug]">) {
  const denied = guardSite(req);
  if (denied) return denied;
  const data = await publicProduct((await ctx.params).slug);
  return data ? siteJson(data) : siteJson({ error: "Not found" }, 404);
}
