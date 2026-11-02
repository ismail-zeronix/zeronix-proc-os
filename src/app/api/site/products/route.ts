import { publicProducts } from "@/lib/website/site-catalog";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** Product cards for the home page shelves: newest first, `?category=<slug>` for one category, `?limit=` up to 48. */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  return siteJson(await publicProducts({ category: q.get("category") || undefined, limit: Number(q.get("limit")) || undefined }));
}
