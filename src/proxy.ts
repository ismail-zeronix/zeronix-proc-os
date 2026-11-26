import { NextResponse, type NextRequest } from "next/server";
import { PLATFORM_COOKIE, verifyPlatform } from "@/lib/auth/platform-token";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";
import { isZeronixOnlyPath, zeronixFeatures } from "@/lib/edition";

/**
 * Public access is limited to health, login, one-time first-run setup, and the website chat widget (its script and the
 * /api/widget endpoints, which check the calling site and the visitor's own token themselves), and the public website's
 * API (/api/site/*, which checks the site's key itself), and the newsletter unsubscribe links. The installed app's files are left out by the matcher below.
 */
export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (pathname === "/api/health" || pathname === "/api/health/db") return NextResponse.next();
  // Zeronix's own features (lib/edition.ts) do not exist in the SaaS install
  if (!zeronixFeatures() && isZeronixOnlyPath(pathname)) return new NextResponse("Not found", { status: 404 });
  if (pathname.startsWith("/api/widget/") || pathname.startsWith("/widget/")) return NextResponse.next();
  if (pathname.startsWith("/api/site/")) return NextResponse.next();
  // an invitation link is opened before its person has an account
  if (pathname.startsWith("/invite/")) return NextResponse.next();
  // "Forgot password?" and the emailed link to choose a new one are used by someone who cannot sign in
  if (pathname === "/forgot-password" || pathname.startsWith("/reset-password/")) return NextResponse.next();
  // a company asking for a free trial has no account yet (the page exists in the SaaS install only)
  if (pathname === "/request-trial") return NextResponse.next();
  // the terms and privacy notice are read before signing up or in
  if (pathname.startsWith("/legal/")) return NextResponse.next();
  // the platform console has its own sign-in (password + authenticator code), apart from every organisation's
  if (pathname === "/platform" || pathname.startsWith("/platform/")) {
    if (pathname === "/platform/login" || pathname === "/platform/signout" || pathname === "/platform/exit") return NextResponse.next();
    if (await verifyPlatform(req.cookies.get(PLATFORM_COOKIE)?.value)) return NextResponse.next();
    return NextResponse.redirect(new URL("/platform/login", req.url));
  }
  // newsletter unsubscribe: the signed token in the address says whom it is for
  if (pathname.startsWith("/unsubscribe/") || pathname.startsWith("/api/newsletter/unsubscribe/")) return NextResponse.next();
  // the Claude connector: its sign-in metadata, registration and token endpoints, and /api/mcp, which checks its own bearer token
  if (pathname.startsWith("/.well-known/oauth-") || pathname.startsWith("/api/oauth/") || pathname === "/api/mcp") return NextResponse.next();

  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = pathname === "/login";
  const isSetup = pathname === "/setup";

  if (!user && !isLogin && !isSetup) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    // keep the query too: the Claude sign-in page (/oauth/authorize?client_id=...) needs all of it after login
    if (pathname !== "/") url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && (isLogin || isSetup)) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

/**
 * Static files skip the gate, and so do the installed app's own files (manifest, service worker, offline page, icons,
 * launch images): browsers fetch the manifest without cookies, and a service worker may not load through a redirect.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|sw.js|offline.html|icons/|splash/|fonts/|.*\\.(?:png|jpg|svg|ico)$).*)",
  ],
};
