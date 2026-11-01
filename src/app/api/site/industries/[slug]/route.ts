import { publicIndustry } from "@/lib/website/site-catalog";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** An industry hub: roles, recommended products, FAQ. */
export async function GET(req: Request, ctx: RouteContext<"/api/site/industries/[slug]">) {
  const denied = guardSite(req);
  if (denied) return denied;
  const data = await publicIndustry((await ctx.params).slug);
  return data ? siteJson(data) : siteJson({ error: "Not found" }, 404);
}
