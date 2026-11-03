import { publicLlms } from "@/lib/website/site-llms";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** The published catalog and posts in short form, for the site's /llms.txt and /llms-full.txt. */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  return siteJson(await publicLlms());
}
