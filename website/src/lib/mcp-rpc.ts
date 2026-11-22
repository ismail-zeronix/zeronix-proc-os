import { MCP_PROTOCOL, mcpTools } from "./agent";

/**
 * The JSON-RPC part of the MCP server at /mcp (Streamable HTTP, stateless: every POST is one request, the answer is
 * plain JSON). Kept apart from the tools so it can be tested without the portal.
 */

export type RpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };
export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<ToolResult>;

const ok = (id: RpcMessage["id"], result: unknown) => ({ jsonrpc: "2.0" as const, id: id ?? null, result });
const fail = (id: RpcMessage["id"], code: number, message: string) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } });

/** Answer for one message; null = a notification, which gets no body (HTTP 202). */
export async function handleRpc(msg: RpcMessage, run: ToolRunner, serverTitle: string) {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg?.id, -32600, "Invalid request");
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case "initialize":
      return ok(msg.id, {
        protocolVersion: MCP_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "zeronixtech", title: serverTitle, version: "1.0.0" },
        instructions: "Search the catalog and guides freely. Quote prices only as returned, never invent them, and call request_quote only after the buyer explicitly agrees.",
      });
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: mcpTools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      if (!mcpTools.some((t) => t.name === name)) return fail(msg.id, -32602, `Unknown tool: ${name}`);
      const args = msg.params?.arguments && typeof msg.params.arguments === "object" ? (msg.params.arguments as Record<string, unknown>) : {};
      try {
        return ok(msg.id, await run(name, args));
      } catch (e) {
        return ok(msg.id, { content: [{ type: "text", text: (e as Error).message || "The tool failed." }], isError: true });
      }
    }
    default:
      return isNotification ? null : fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
