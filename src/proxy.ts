import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/** Public access is limited to health, login, and one-time first-run setup. */
export async function proxy(req: NextRequest) {
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const pathname = req.nextUrl.pathname;
  const isLogin = pathname === "/login";
  const isSetup = pathname === "/setup";

  if (pathname === "/api/health") return NextResponse.next();

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
