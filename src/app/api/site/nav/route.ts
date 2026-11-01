import { publicNav } from "@/lib/website/site-api";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** Published industries, categories and brands for the site's mega menu. */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  return siteJson(await publicNav());
}
