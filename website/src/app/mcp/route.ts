import { getSettings } from "@/lib/api";
import { handleRpc, type RpcMessage } from "@/lib/mcp-rpc";
import { runTool } from "@/lib/mcp-tools";

/**
 * Model Context Protocol server (Streamable HTTP, stateless JSON replies) so AI agents can search the catalog and send a
 * quote request without scraping (website/SEO-AGENTIC.md). Read tools are open; request_quote needs the buyer's consent.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
};

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 50_000) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413, headers: CORS });
  let body: RpcMessage | RpcMessage[];
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const { brand } = await getSettings();
  const run = (name: string, args: Record<string, unknown>) => runTool(name, args, { ip, host });

  const messages = Array.isArray(body) ? body.slice(0, 10) : [body];
  const replies = (await Promise.all(messages.map((m) => handleRpc(m, run, brand.name)))).filter((r) => r !== null);
  if (!replies.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(Array.isArray(body) ? replies : replies[0], { headers: { ...CORS, "Cache-Control": "no-store" } });
}

/** This server has no server-initiated stream, so GET is not offered (the spec allows 405). */
export function GET() {
  return new Response("This is an MCP endpoint: POST JSON-RPC here. See /.well-known/mcp/server-card.json", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS", "Content-Type": "text/plain" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export const dynamic = "force-dynamic";
