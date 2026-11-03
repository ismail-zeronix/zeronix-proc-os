import "server-only";
import { cookies } from "next/headers";

/**
 * Shop calls from the site's own /api routes to the portal (/api/site/*), never cached: the site key, the visitor's IP
 * and, when signed in, the customer token from the httpOnly cookie. Visitors never talk to the portal directly.
 */

export const CUSTOMER_COOKIE = "zx_customer";

export function visitorIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function portalCall(path: string, init: { method?: "GET" | "POST" | "PUT"; body?: unknown; req?: Request } = {}): Promise<{ status: number; data: Record<string, unknown> }> {
  const base = process.env.PORTAL_INTERNAL_URL;
  const key = process.env.SITE_API_KEY;
  if (!base || !key) return { status: 503, data: { error: "The shop is not available right now. Please call or chat with us." } };
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  const res = await fetch(`${base.replace(/\/$/, "")}/api/site${path}`, {
    method: init.method ?? "GET",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-site-key": key,
      ...(init.req ? { "x-visitor-ip": visitorIp(init.req), "x-site-host": init.req.headers.get("x-forwarded-host") ?? init.req.headers.get("host") ?? "" } : {}),
      ...(token ? { "x-customer-token": token } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res) return { status: 502, data: { error: "We could not reach the shop right now. Please try again in a moment." } };
  return { status: res.status, data: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
}

/** Reads a JSON body of at most `max` characters; null when it is not JSON or too long. */
export async function jsonBody(req: Request, max = 20_000): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > max) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
