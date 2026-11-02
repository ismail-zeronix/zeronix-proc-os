import { CONTRACT_VERSION } from "@/lib/website/contract";
import { searchProducts, searchWords } from "@/lib/website/site-catalog";
import { searchPosts } from "@/lib/website/site-posts";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** Site search: ?q=thinkpad 16gb. Products whose name, part number, brand or category hold every word, then posts. */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  const [products, posts] = await Promise.all([searchProducts(q), searchPosts(searchWords(q))]);
  return siteJson({ contract: CONTRACT_VERSION, q, products, posts });
}
