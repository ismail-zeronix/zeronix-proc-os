import { allow } from "@/lib/webchat/public";
import { ingestEvents } from "@/lib/website/events";
import { guardSite, siteJson } from "@/lib/website/site-key";
import { batchSchema } from "@/lib/website/traffic";

/**
 * Tracker events, passed on by the site's /api/t with the visitor's IP and browser in headers (the portal never sees
 * visitors directly). Stored in the website database only; the IP is used for the daily hash and dropped.
 */
export async function POST(req: Request) {
  const denied = guardSite(req);
  if (denied) return denied;
  const ip = req.headers.get("x-visitor-ip") ?? "unknown";
  if (!allow(`site-events:${ip}`, 600, 10 * 60_000)) return siteJson({ error: "Too many events" }, 429);
  const parsed = batchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return siteJson({ error: "Bad batch" }, 400);
  const kept = await ingestEvents(parsed.data.events, {
    ip,
    ua: (req.headers.get("x-visitor-ua") ?? "").slice(0, 500),
    host: (req.headers.get("x-site-host") ?? "").slice(0, 120),
  });
  return siteJson({ ok: true, kept });
}
