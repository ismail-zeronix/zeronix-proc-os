import { buildLlms, llmsResponse } from "@/lib/llms";

/** A map of the site for AI assistants and agents (llmstxt.org). The full catalog is in /llms-full.txt. */
export async function GET() {
  return llmsResponse(await buildLlms(false));
}

export const revalidate = 600;
