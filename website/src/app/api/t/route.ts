import { after } from "next/server";

/**
 * The tracker posts here (sendBeacon, same origin, no cookie). The visitor gets 204 at once; the events go on to the
 * portal over site-net afterwards, with the IP and browser in headers so the portal can make its daily visitor hash.
 */

const hits = new Map<string, number[]>();

function allow(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (list.length >= 300) return false;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 10_000) hits.clear();
  return true;
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview/i;

export async function POST(req: Request) {
  const ua = req.headers.get("user-agent") ?? "";
  const text = await req.text();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const base = process.env.PORTAL_INTERNAL_URL;
  const key = process.env.SITE_API_KEY;
  if (text.length > 8000 || BOT.test(ua) || !base || !key || !allow(ip)) return new Response(null, { status: 204 });
  after(() =>
    fetch(`${base.replace(/\/$/, "")}/api/site/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-site-key": key,
        "x-visitor-ip": ip,
        "x-visitor-ua": ua.slice(0, 500),
        "x-site-host": req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "",
      },
      body: text,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined),
  );
  return new Response(null, { status: 204 });
}
