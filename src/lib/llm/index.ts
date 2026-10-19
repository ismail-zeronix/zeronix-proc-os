import { OllamaProvider } from "./ollama";
import type { LlmProvider } from "./provider";

/** Model can be overridden at runtime from the admin settings page. */
export function getLlm(modelOverride?: string | null): LlmProvider {
  return new OllamaProvider({
    baseUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
    model: modelOverride || process.env.LLM_MODEL || "qwen3.5:4b",
    numCtx: Number(process.env.LLM_NUM_CTX ?? 4096),
    keepAlive: process.env.LLM_KEEP_ALIVE ?? "5m",
  });
}
