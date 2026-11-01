import { publicAuthor } from "@/lib/website/site-posts";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** An author and their published posts. */
export async function GET(req: Request, ctx: RouteContext<"/api/site/authors/[slug]">) {
  const denied = guardSite(req);
  if (denied) return denied;
  const data = await publicAuthor((await ctx.params).slug);
  return data ? siteJson(data) : siteJson({ error: "Not found" }, 404);
}
