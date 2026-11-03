import { SITE_URL } from "@/lib/defaults";
import { flags } from "@/lib/flags";
import { AI_CRAWLERS, PRIVATE_PATHS } from "@/lib/seo";

/**
 * robots.txt, written by hand (not robots.ts) so it can carry Content-Signal lines and one deliberate group per kind of
 * crawler. Closed to everyone until go-live (SITE_INDEXING=true), so a half-built site is never indexed.
 */
export function GET() {
  const text = flags.indexing ? open() : "User-agent: *\nDisallow: /\n";
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}

function open() {
  const rules = ["Allow: /", ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`)];
  // the owner wants the brand in every AI assistant: search, answers and training are all welcome (contentsignals.org)
  const signal = "Content-Signal: search=yes, ai-input=yes, ai-train=yes";
  const group = (title: string, agents: string[]) => [`# ${title}`, ...agents.map((a) => `User-agent: ${a}`), signal, ...rules, ""].join("\n");
  return [
    `# ${SITE_URL}: business IT for UAE companies. AI assistants and agents: start at ${SITE_URL}/llms.txt`,
    "",
    group("Search engines and AI search (citations in ChatGPT, Claude, Perplexity, Gemini, Copilot)", AI_CRAWLERS.search),
    group("AI model training: allowed, so assistants know the brand", AI_CRAWLERS.training),
    group("Pages fetched when a person asks an assistant about us", AI_CRAWLERS.user),
    group("Everyone else", ["*"]),
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");
}

export const dynamic = "force-dynamic";
