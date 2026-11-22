import { getSettings } from "@/lib/api";
import { agentSkillText } from "@/lib/agent";

/** The skill itself. Its text must stay byte-identical to what the index hashes, so both call agentSkillText. */
export async function GET() {
  const { brand } = await getSettings();
  return new Response(agentSkillText(brand.name), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}
