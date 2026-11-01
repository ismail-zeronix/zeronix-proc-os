/**
 * The quote form posts here; the site passes it on to the portal over site-net with its key (visitors never reach the
 * portal). Bots that fill the hidden "website" field get a polite "thank you" and nothing is stored.
 */

const hits = new Map<string, number[]>();

function allow(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60 * 60_000);
  if (list.length >= 8) return false;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return true;
}

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 20_000) return Response.json({ error: "That is too much text." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Please check the form." }, { status: 400 });
  }
  if (typeof body.website === "string" && body.website.trim()) return Response.json({ ok: true });
  delete body.website;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!allow(ip)) return Response.json({ error: "Too many requests. Please try again later, or chat with us." }, { status: 429 });

  const base = process.env.PORTAL_INTERNAL_URL;
  const key = process.env.SITE_API_KEY;
  if (!base || !key) return Response.json({ error: "We could not send your request right now. Please chat with us or call." }, { status: 503 });
  const res = await fetch(`${base.replace(/\/$/, "")}/api/site/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-site-key": key, "x-visitor-ip": ip, "x-site-host": req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res) return Response.json({ error: "We could not send your request right now. Please try again in a moment." }, { status: 502 });
  const data = await res.json().catch(() => ({}));
  return Response.json(res.ok ? { ok: true } : { error: data.error ?? "Please check the form." }, { status: res.ok ? 200 : res.status });
}
