import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/client-ip";
import { exchangeCode, OAuthError, refreshTokens } from "@/lib/mcp/oauth";
import { allow } from "@/lib/webchat/public";

const noStore = { "cache-control": "no-store", pragma: "no-cache" };

/** The OAuth token endpoint (form-encoded, RFC 6749): code → tokens, and refresh → new tokens. */
export async function POST(req: Request) {
  const ip = ipFromHeaders(req.headers);
  if (!allow(`mcp-token:${ip}`, 60, 60_000)) return NextResponse.json({ error: "slow_down" }, { status: 429, headers: noStore });
  let f: URLSearchParams;
  try {
    const type = req.headers.get("content-type") ?? "";
    f = type.includes("application/json") ? new URLSearchParams((await req.json()) as Record<string, string>) : new URLSearchParams(await req.text());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: noStore });
  }
  const get = (k: string) => f.get(k) ?? "";
  try {
    const grant = get("grant_type");
    if (grant === "authorization_code") {
      if (!get("code") || !get("client_id") || !get("redirect_uri") || !get("code_verifier")) throw new OAuthError("invalid_request", "Missing a required field");
      const t = await exchangeCode({ code: get("code"), clientId: get("client_id"), redirectUri: get("redirect_uri"), codeVerifier: get("code_verifier") });
      return NextResponse.json(t, { headers: noStore });
    }
    if (grant === "refresh_token") {
      if (!get("refresh_token") || !get("client_id")) throw new OAuthError("invalid_request", "Missing a required field");
      const t = await refreshTokens({ refreshToken: get("refresh_token"), clientId: get("client_id") });
      return NextResponse.json(t, { headers: noStore });
    }
    throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token");
  } catch (e) {
    if (e instanceof OAuthError) return NextResponse.json({ error: e.code, error_description: e.message }, { status: 400, headers: noStore });
    console.error("[mcp-oauth] token error", e);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: noStore });
  }
}
