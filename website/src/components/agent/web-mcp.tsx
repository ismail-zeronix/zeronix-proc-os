"use client";

import { useEffect } from "react";

/**
 * WebMCP: tells an AI agent that is browsing this page (Chrome's built-in agent, assistants with a browser) what it can
 * do here without clicking around: search the catalog, open a product, start a quote. Nothing happens unless a browser
 * offers `navigator.modelContext`; everywhere else this renders nothing and does nothing. Buying or sending a request
 * still goes through the visible forms, which a person confirms (website/SEO-AGENTIC.md).
 */

type ToolResult = { content: { type: "text"; text: string }[] };
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
};
type ModelContext = { registerTool?: (t: Tool) => unknown; unregisterTool?: (name: string) => void };

const say = (text: string): ToolResult => ({ content: [{ type: "text", text }] });

async function callMcp(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch("/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const data = await res.json();
  return data?.result?.content?.[0]?.text ?? data?.error?.message ?? "No answer.";
}

const TOOLS: Tool[] = [
  {
    name: "search_products",
    description: "Search the catalog of business laptops, desktops, workstations, servers and accessories by words, brand, model or part number. Returns prices (AED incl. 5% VAT or on request) and product URLs.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    annotations: { readOnlyHint: true },
    execute: async (a) => say(await callMcp("search_products", { query: a.query })),
  },
  {
    name: "open_product",
    description: "Open a product page in this browser tab. Use the slug and category returned by search_products (the URL path /products/{category}/{slug}).",
    inputSchema: { type: "object", properties: { path: { type: "string", description: "Site path such as /products/laptops/some-model" } }, required: ["path"] },
    annotations: { readOnlyHint: true },
    execute: async (a) => {
      const path = String(a.path ?? "");
      if (!/^\/products(\/[a-z0-9-]+){0,2}$/i.test(path)) return say("That is not a product path.");
      window.location.assign(path);
      return say(`Opening ${path}.`);
    },
  },
  {
    name: "start_quote",
    description: "Open the B2B quote form, optionally prefilled with a product. It only opens the form: the buyer reviews it and presses send themselves.",
    inputSchema: { type: "object", properties: { product: { type: "string", description: "Product slug (optional)" } } },
    execute: async (a) => {
      const slug = typeof a.product === "string" && /^[a-z0-9-]{1,120}$/i.test(a.product) ? a.product : "";
      window.location.assign(slug ? `/quote?product=${encodeURIComponent(slug)}` : "/quote");
      return say("Opened the quote form. The buyer fills in and sends it.");
    },
  },
];

export function WebMcp() {
  useEffect(() => {
    const mc = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
    if (!mc?.registerTool) return;
    const done: string[] = [];
    for (const t of TOOLS) {
      try {
        mc.registerTool(t);
        done.push(t.name);
      } catch {
        // already registered (fast refresh) or a browser that changed the shape: skip quietly
      }
    }
    return () => {
      for (const n of done) {
        try {
          mc.unregisterTool?.(n);
        } catch {}
      }
    };
  }, []);
  return null;
}
