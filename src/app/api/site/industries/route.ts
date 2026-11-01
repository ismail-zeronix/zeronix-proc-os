import { publicIndustries } from "@/lib/website/site-catalog";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** Published industries with their card pictures. */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  return siteJson(await publicIndustries());
}
