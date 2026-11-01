import { CONTRACT_VERSION, type SiteHealth } from "@/lib/website/contract";
import { guardSite, siteJson } from "@/lib/website/site-key";

/** The site checks that the portal answers and that both speak the same contract version. */
export async function GET(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  return siteJson({ ok: true, contract: CONTRACT_VERSION } satisfies SiteHealth);
}
