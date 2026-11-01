import { allow } from "@/lib/webchat/public";
import { createQuoteRequest, quoteSchema } from "@/lib/website/quotes";
import { guardSite, siteJson } from "@/lib/website/site-key";

/**
 * A "Get B2B pricing" form, passed on by the site's /api/quote (which has already checked the honeypot). The visitor's
 * IP comes in x-visitor-ip (the site sees it, the portal sees only the site), and limits requests per visitor.
 */
export async function POST(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const ip = req.headers.get("x-visitor-ip") ?? "unknown";
  if (!allow(`site-quote:${ip}`, 6, 60 * 60_000)) return siteJson({ error: "Too many requests from your network. Please try again later or call us." }, 429);
  const body = await req.json().catch(() => null);
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) return siteJson({ error: parsed.error.issues[0]?.message ?? "Please check the form" }, 400);
  const site = (req.headers.get("x-site-host") ?? "").replace(/^www\./, "").slice(0, 120);
  const id = await createQuoteRequest(parsed.data, site);
  return siteJson({ ok: true, id });
}
