import { publicCategory } from "@/lib/website/site-catalog";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** A category with its published products and the brand / industry filters. */
export async function GET(req: Request, ctx: RouteContext<"/api/site/categories/[slug]">) {
  const denied = guardSite(req);
  if (denied) return denied;
  const data = await publicCategory((await ctx.params).slug);
  return data ? siteJson(data) : siteJson({ error: "Not found" }, 404);
}
