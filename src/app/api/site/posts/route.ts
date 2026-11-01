import { publicPosts } from "@/lib/website/site-posts";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** Published posts: ?kind=guides|articles&industry=&category=&author=&page= */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const get = (k: string) => q.get(k)?.slice(0, 90) || undefined;
  return siteJson(await publicPosts({ kind: get("kind"), industry: get("industry"), category: get("category"), author: get("author"), page: Number(q.get("page")) || 1 }));
}
