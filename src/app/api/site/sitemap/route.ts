import { publicSitemap } from "@/lib/website/site-posts";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** Every public page with its last change. */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  return siteJson(await publicSitemap());
}
