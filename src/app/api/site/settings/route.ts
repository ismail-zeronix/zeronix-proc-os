import { publicSettings } from "@/lib/website/site-api";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** Brand, contact details and call-to-action text for the site's header, footer and home page. */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  return siteJson(await publicSettings());
}
