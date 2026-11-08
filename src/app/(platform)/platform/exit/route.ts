import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/** Ends a support visit: the organisation's cookie goes, the console stays signed in. */
export async function GET(req: Request) {
  const token = req.headers.get("cookie")?.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`))?.[1];
  const s = await verifySession(token ? decodeURIComponent(token) : undefined);
  const res = NextResponse.redirect(new URL(s?.support && s.org ? `/platform/tenants/${s.org}` : "/platform", req.url));
  // only a support visit's cookie is removed here: someone's own sign-in is never touched by this link
  if (s?.support) res.cookies.delete(SESSION_COOKIE);
  return res;
}
