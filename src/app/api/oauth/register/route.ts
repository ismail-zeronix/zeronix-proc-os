import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/client-ip";
import { registerClient } from "@/lib/mcp/oauth";
import { redirectAllowed } from "@/lib/mcp/oauth-rules";
import { allow } from "@/lib/webchat/public";

/**
 * RFC 7591 dynamic client registration. Claude registers itself here before the sign-in. Only Claude's own return
 * address and Claude Code's loopback address are accepted, so no other website can use this to sign people in.
 */
export async function POST(req: Request) {
  const ip = ipFromHeaders(req.headers);
  if (!allow(`mcp-register:${ip}`, 20, 3600_000)) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "Body must be JSON" }, { status: 400 });
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectAllowed)) {
    return NextResponse.json({ error: "invalid_redirect_uri", error_description: "Only Claude's callback address is accepted" }, { status: 400 });
  }
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "Only public clients (no secret) are supported" }, { status: 400 });
  }
  const name = typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim() : "Claude";
  const clientId = await registerClient(name, uris);
  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}
