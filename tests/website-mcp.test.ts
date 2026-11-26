import { describe, expect, it, vi } from "vitest";
import { mcpTools } from "../website/src/lib/agent";
import { handleRpc } from "../website/src/lib/mcp-rpc";

/** The MCP endpoint's JSON-RPC layer (website/SEO-AGENTIC.md). */

const run = vi.fn(async (name: string) => ({ content: [{ type: "text" as const, text: `ran ${name}` }] }));

describe("handleRpc", () => {
  it("initializes with the protocol, tools capability and server info", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, run, "Zeronix Tech");
    expect(r).toMatchObject({ id: 1, result: { capabilities: { tools: {} }, serverInfo: { name: "zeronixtech", title: "Zeronix Tech" } } });
  });
  it("lists every tool", async () => {
    const r = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, run, "x")) as { result: { tools: { name: string }[] } };
    expect(r.result.tools.map((t) => t.name)).toEqual(mcpTools.map((t) => t.name));
  });
  it("runs a known tool and returns its result", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_catalog", arguments: {} } }, run, "x");
    expect(r).toMatchObject({ id: 3, result: { content: [{ text: "ran list_catalog" }] } });
  });
  it("reports a failing tool as a tool error, not a protocol error", async () => {
    const bad = vi.fn(async () => {
      throw new Error("query is required");
    });
    const r = await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_products", arguments: {} } }, bad, "x");
    expect(r).toMatchObject({ result: { isError: true, content: [{ text: "query is required" }] } });
  });
  it("rejects unknown tools and methods", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "drop_tables" } }, run, "x")).toMatchObject({ error: { code: -32602 } });
    expect(await handleRpc({ jsonrpc: "2.0", id: 6, method: "resources/list" }, run, "x")).toMatchObject({ error: { code: -32601 } });
    expect(await handleRpc({ id: 7, method: "ping" } as never, run, "x")).toMatchObject({ error: { code: -32600 } });
  });
  it("answers notifications with nothing", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, run, "x")).toBeNull();
  });
});
