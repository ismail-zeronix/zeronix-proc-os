import { NextResponse } from "next/server";
import { mcpUrl, portalBase, resourceMetadataUrl, verifyAccess } from "@/lib/mcp/oauth";
import { handleRpc, type RpcMessage } from "@/lib/mcp/rpc";
import { mcpTools } from "@/lib/mcp/tools";
import type { McpCtx } from "@/lib/mcp/tool";
import { allow } from "@/lib/webchat/public";

/**
 * The Claude connector (MCP, Streamable HTTP, stateless JSON). Admins and sales staff sign in through OAuth (lib/mcp/oauth.ts); every
 * call is checked against their connection, and write tools need the "write" permission they ticked when connecting.
 */
export const dynamic = "force-dynamic";
const MAX_BODY = 100_000;

function unauthorized(req: Request) {
  const base = portalBase(req.url);
  return NextResponse.json(
    { error: "unauthorized", error_description: "Sign in to Zeronix OS to use this connector" },
    { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(base)}"` } },
  );
}

export async function POST(req: Request) {
  const auth = await verifyAccess(req.headers.get("authorization"));
  if (!auth) return unauthorized(req);
  if (!allow(`mcp:${auth.grantId}`, 120, 60_000)) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many requests; wait a minute" } }, { status: 429 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  // what this person sees in the portal is what Claude sees: their own data scope, and only the tools of their apps
  const ctx: McpCtx = { auth, viewer: { id: auth.userId, seesAll: auth.seesAll }, base: portalBase(req.url) };
  const tools = mcpTools.filter((t) => t.allowed(auth));
  const server = { tools, canWrite: auth.write, run: (name: string, args: Record<string, unknown>) => tools.find((t) => t.name === name)!.call(args, ctx) };

  if (Array.isArray(body)) {
    const answers = (await Promise.all(body.slice(0, 10).map((m) => handleRpc(m as RpcMessage, server)))).filter(Boolean);
    return answers.length ? NextResponse.json(answers) : new NextResponse(null, { status: 202 });
  }
  const answer = await handleRpc(body as RpcMessage, server);
  return answer ? NextResponse.json(answer) : new NextResponse(null, { status: 202 });
}

/** No server-to-client stream: this server only answers requests. */
export function GET(req: Request) {
  return new NextResponse(`Zeronix OS MCP server. Add ${mcpUrl(portalBase(req.url))} as a custom connector in Claude.`, { status: 405, headers: { allow: "POST" } });
}

/** Stateless: nothing to close. */
export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
