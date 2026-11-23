import { NextResponse } from "next/server";
import { mcpUrl, portalBase } from "@/lib/mcp/oauth";
import { SCOPES } from "@/lib/mcp/oauth-rules";

/** RFC 9728: where Claude finds out how to sign in to the connector at /api/mcp (also served at .../api/mcp). */
export function GET(req: Request) {
  const base = portalBase(req.url);
  return NextResponse.json(
    {
      resource: mcpUrl(base),
      authorization_servers: [base],
      scopes_supported: [...SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "Zeronix OS",
    },
    { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } },
  );
}
