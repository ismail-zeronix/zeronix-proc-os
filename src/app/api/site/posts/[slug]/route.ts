import { publicPost } from "@/lib/website/site-posts";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** One published post: body blocks, picks, comparison, FAQ, byline, related posts. */
export async function GET(req: Request, ctx: RouteContext<"/api/site/posts/[slug]">) {
  const denied = guardSite(req);
  if (denied) return denied;
  const data = await publicPost((await ctx.params).slug);
  return data ? siteJson(data) : siteJson({ error: "Not found" }, 404);
}
