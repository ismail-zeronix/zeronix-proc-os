import { connectPrefill } from "@/lib/website/connect";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** The /connect page asks who a cold email's link belongs to, to fill the form in. Empty for links that are not ours. */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const ref = new URL(req.url).searchParams.get("r") ?? "";
  return siteJson(await connectPrefill(ref.slice(0, 80)));
}
