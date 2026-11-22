import { getSettings } from "@/lib/api";
import { skillIndex } from "@/lib/agent";

/** Agent Skills discovery index: the skills this site offers, each with a sha256 digest of its SKILL.md. */
export async function GET() {
  const { brand } = await getSettings();
  return new Response(JSON.stringify(await skillIndex(brand.name), null, 2), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" },
  });
}
