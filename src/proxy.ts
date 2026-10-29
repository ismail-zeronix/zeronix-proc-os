import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/**
 * Public access is limited to health, login, one-time first-run setup, and the website chat widget (its script and the
 * /api/widget endpoints, which check the calling site and the visitor's own token themselves).
 */
export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (pathname === "/api/health" || pathname === "/api/health/db") return NextResponse.next();
  if (pathname.startsWith("/api/widget/") || pathname.startsWith("/widget/")) return NextResponse.next();

  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = pathname === "/login";
  const isSetup = pathname === "/setup";

  if (!user && !isLogin && !isSetup) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (isLogin || isSetup)) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
