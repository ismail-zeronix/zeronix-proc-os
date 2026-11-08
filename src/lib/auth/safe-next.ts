/** Where to go after signing in: a page of this site only ("/crm", never "//evil.com" or "/\evil.com"). */
export function safeNext(next: string | undefined | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n\t]/.test(next)) return "/";
  try {
    const u = new URL(next, "http://portal.local");
    return u.origin === "http://portal.local" ? `${u.pathname}${u.search}${u.hash}` : "/";
  } catch {
    return "/";
  }
}
