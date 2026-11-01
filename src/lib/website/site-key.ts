import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { allow, clientIp } from "@/lib/webchat/public";

/**
 * The public site (website/, its own container) calls /api/site/* with the shared SITE_API_KEY in `x-site-key`. Without
 * a key set on the portal the API is closed. Wrong keys are limited per IP, so the key cannot be guessed.
 */
export function siteKeyOk(given: string | null, expected = process.env.SITE_API_KEY ?? ""): boolean {
  if (expected.length < 24 || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** For route handlers: a 401/429 response to return, or null when the caller may go on. */
export function guardSite(req: Request): Response | null {
  if (siteKeyOk(req.headers.get("x-site-key"))) return null;
  const ip = clientIp(req) || "unknown";
  if (!allow(`site-key-fail:${ip}`, 20, 60 * 60_000)) return Response.json({ error: "Too many requests" }, { status: 429 });
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/** JSON for the site: never cached by anything in between (the site keeps its own cache). */
export function siteJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
