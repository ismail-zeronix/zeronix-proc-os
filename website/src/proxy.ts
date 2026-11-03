import { NextResponse, type NextRequest } from "next/server";

/**
 * One address per page: www.zeronixtech.com moves permanently to zeronixtech.com (SITE_URL), so search engines never
 * see two copies of the site. Caddy keeps the visitor's Host header, which is what this reads.
 */
export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (!host.startsWith("www.")) return NextResponse.next();
  const site = new URL(process.env.SITE_URL || "https://zeronixtech.com");
  if (host.slice(4).split(":")[0] !== site.hostname) return NextResponse.next();
  const to = new URL(req.nextUrl.pathname + req.nextUrl.search, site);
  return NextResponse.redirect(to, 308);
}

export const config = {
  // pages and files, not Next's own assets
  matcher: ["/((?!_next/static|_next/image).*)"],
};
