import { allow } from "@/lib/webchat/public";
import { guardSite, siteJson } from "@/lib/website/site-key";
import { customerFromToken, placeOrder, StoreProblem } from "@/lib/website/store";
import { checkoutSchema } from "@/lib/website/store-core";

/**
 * Checkout, passed on by the site's /api/order (honeypot already checked). The portal prices the order from the
 * database; a signed-in customer comes in x-customer-token, the visitor's IP in x-visitor-ip.
 */
export async function POST(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const ip = req.headers.get("x-visitor-ip") ?? "unknown";
  if (!allow(`site-order:${ip}`, 10, 60 * 60_000)) return siteJson({ error: "Too many orders from your network. Please call us." }, 429);
  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return siteJson({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, 400);
  const customerId = await customerFromToken(req.headers.get("x-customer-token"));
  const site = (req.headers.get("x-site-host") ?? "").replace(/^www\./, "").slice(0, 120);
  try {
    return siteJson(await placeOrder(parsed.data, customerId, site));
  } catch (e) {
    if (e instanceof StoreProblem) return siteJson({ error: e.message }, e.status);
    throw e;
  }
}
