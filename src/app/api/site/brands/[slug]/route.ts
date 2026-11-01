import { publicBrand } from "@/lib/website/site-catalog";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** A brand with its published products. */
export async function GET(req: Request, ctx: RouteContext<"/api/site/brands/[slug]">) {
  const denied = guardSite(req);
  if (denied) return denied;
  const data = await publicBrand((await ctx.params).slug);
  return data ? siteJson(data) : siteJson({ error: "Not found" }, 404);
}
