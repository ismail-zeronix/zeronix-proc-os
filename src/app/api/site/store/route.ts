import { guardSite, siteJson } from "@/lib/website/site-key";
import { publicStore } from "@/lib/website/store";

/** What checkout shows: payment options, bank details, delivery note, and whether signing in works. */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  return siteJson(await publicStore());
}
