import { NextResponse, type NextRequest } from "next/server";
import { acceptsMarkdown, linkHeader, markdownRoute } from "@/lib/agent";

/**
 * One address per page: www.zeronixtech.com moves permanently to zeronixtech.com (SITE_URL), so search engines never
 * see two copies of the site. Caddy keeps the visitor's Host header, which is what this reads.
 *
 * Agents (website/SEO-AGENTIC.md): a request for `Accept: text/markdown`, or a path ending in `.md`, is answered from
 * /md (Markdown copy of the same page); the home page also carries a Link header that points to the sitemap, llms.txt
 * and the API catalog.
 */
export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (host.startsWith("www.")) {
    const site = new URL(process.env.SITE_URL || "https://zeronixtech.com");
    if (host.slice(4).split(":")[0] === site.hostname) return NextResponse.redirect(new URL(req.nextUrl.pathname + req.nextUrl.search, site), 308);
  }

  const { pathname } = req.nextUrl;
  const wantsMarkdown = pathname.endsWith(".md") || acceptsMarkdown(req.headers.get("accept"));
  if ((req.method === "GET" || req.method === "HEAD") && wantsMarkdown && markdownRoute(pathname)) {
    const to = req.nextUrl.clone();
    to.pathname = `/md${pathname.replace(/\.md$/, "").replace(/\/+$/, "") || "/"}`.replace(/\/$/, "");
    return NextResponse.rewrite(to);
  }

  const res = NextResponse.next();
  if (pathname === "/") res.headers.append("Link", linkHeader());
  return res;
}

export const config = {
  // pages and files, not Next's own assets
  matcher: ["/((?!_next/static|_next/image).*)"],
};
