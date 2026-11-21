import { SITE_URL } from "@/lib/defaults";

/** RFC 9116: who to tell about a security problem. The address is the privacy contact already on the Privacy page. */
export function GET() {
  const text = [`Contact: mailto:info@zeronix.ae`, `Expires: ${new Date(Date.now() + 365 * 864e5).toISOString()}`, `Preferred-Languages: en, ar`, `Canonical: ${SITE_URL}/.well-known/security.txt`, ""].join("\n");
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
