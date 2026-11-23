import { NextResponse } from "next/server";
import { portalBase } from "@/lib/mcp/oauth";
import { SCOPES } from "@/lib/mcp/oauth-rules";

/** RFC 8414: the portal's sign-in endpoints for the Claude connector. */
export function GET(req: Request) {
  const base = portalBase(req.url);
  return NextResponse.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      scopes_supported: [...SCOPES],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    },
    { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } },
  );
}
