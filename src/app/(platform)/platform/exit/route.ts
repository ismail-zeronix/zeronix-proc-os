import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/**
 * Ends a support visit: the organisation's cookie goes, the console stays signed in. The redirect is relative, so it
 * is right behind any proxy (the server itself listens on 0.0.0.0 inside its container).
 */
export async function GET(req: Request) {
  const token = req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`))?.[1];
  const s = await verifySession(token ? decodeURIComponent(token) : undefined);
  const headers = new Headers({ Location: s?.support && s.org ? `/platform/tenants/${s.org}` : "/platform" });
  // only a support visit's cookie is removed here: someone's own sign-in is never touched by this link
  if (s?.support) headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
  return new Response(null, { status: 303, headers });
}
