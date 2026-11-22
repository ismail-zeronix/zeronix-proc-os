import { apiCatalog } from "@/lib/agent";

/** RFC 9727: where an agent finds this site's machine-readable endpoints. */
export function GET() {
  return new Response(JSON.stringify(apiCatalog(), null, 2), {
    headers: { "Content-Type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"', "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}
