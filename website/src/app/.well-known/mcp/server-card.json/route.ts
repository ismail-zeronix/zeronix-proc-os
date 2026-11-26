import { getSettings } from "@/lib/api";
import { serverCard } from "@/lib/agent";

/** MCP server card: lets an MCP client discover /mcp and its tools from the domain alone. */
export async function GET() {
  const { brand } = await getSettings();
  return new Response(JSON.stringify(serverCard(brand.name), null, 2), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}
