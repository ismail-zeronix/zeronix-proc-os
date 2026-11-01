import { publicCompare } from "@/lib/website/site-catalog";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** Two to four products side by side: ?p=slug-a,slug-b */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const slugs = (new URL(req.url).searchParams.get("p") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const data = await publicCompare(slugs);
  return data ? siteJson(data) : siteJson({ error: "Not found" }, 404);
}
