import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { OllamaProvider } from "./ollama";
import type { LlmProvider } from "./provider";

/** Model can be overridden at runtime from the admin settings page. */
export function getLlm(modelOverride?: string | null, signal?: AbortSignal): LlmProvider {
  return new OllamaProvider({
    baseUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
    model: modelOverride || process.env.LLM_MODEL || "qwen3.5:4b",
    numCtx: Number(process.env.LLM_NUM_CTX ?? 4096),
    keepAlive: process.env.LLM_KEEP_ALIVE ?? "1m",
    signal,
  });
}

/**
 * What reads pasted price lists: the local Ollama model, or an AI service saved in Prospecting → Settings
 * (setting llm_provider_id). A provider that was deleted falls back to the local model.
 */
export async function getPriceListLlm(signal?: AbortSignal): Promise<LlmProvider> {
  const s = await getSettings();
  const id = Number(s.llm_provider_id);
  if (id) {
    const [row] = await db.select().from(schema.prospectAiProviders).where(eq(schema.prospectAiProviders.id, id));
    if (row) {
      // loaded only when used: it pulls in server-only code that scripts cannot import
      const { HostedProvider } = await import("./hosted");
      return new HostedProvider(row);
    }
  }
  return getLlm(s.llm_model, signal);
}
