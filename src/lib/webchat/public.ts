import "server-only";

/**
 * Helpers for the public widget endpoints (/api/widget/*). They are open to the internet, so: only the website's own
 * origins may call them from a browser (WEBCHAT_ORIGINS, comma separated), bodies are small, and each IP and chat is
 * rate limited. The widget posts JSON as text/plain, which keeps the browser from sending a CORS preflight first.
 */

const DEFAULT_ORIGINS = "https://www.zeronix.ae,https://zeronix.ae";

function allowedOrigins(): string[] {
  return (process.env.WEBCHAT_ORIGINS ?? DEFAULT_ORIGINS)
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/** The Origin to echo back, "" for a same-site call with no Origin header, or null when this site may not call us. */
export function originOf(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return "";
  if (origin === new URL(req.url).origin) return origin;
  if (allowedOrigins().includes(origin)) return origin;
  // testing: any local page (or a file opened straight from disk) outside production
  if (process.env.NODE_ENV !== "production" && (origin === "null" || /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin))) return origin;
  return null;
}

export function corsHeaders(origin: string): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function reply(origin: string, data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { ...corsHeaders(origin), "Cache-Control": "no-store" } });
}

export function preflight(req: Request): Response {
  const origin = originOf(req);
  if (origin === null) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

/** Reads a small JSON body (sent as text/plain). */
export async function readJson(req: Request, maxBytes = 8_000): Promise<Record<string, unknown> | null> {
  const text = await req.text().catch(() => "");
  if (!text || text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
}

/** A trimmed string from the body, cut to `max`; anything else becomes "". */
export const cleanString = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------- rate limits (per process, which is enough for one web server) ----------

const g = globalThis as unknown as { webchatHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.webchatHits ??= new Map());

/** True when `key` has been used fewer than `max` times in the last `windowMs`; counts this use. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 3600_000)) hits.delete(k);
  return true;
}
