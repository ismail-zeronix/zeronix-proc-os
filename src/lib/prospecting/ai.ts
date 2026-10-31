/** The AI services Prospecting can be connected to, and what each one may be used for. */

export const AI_PROVIDERS = [
  {
    key: "anthropic",
    label: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com",
    needsKey: true,
    models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
    hint: "Key from console.anthropic.com. Haiku for research notes and sorting replies, Sonnet for drafts.",
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    models: [],
    hint: "Key from openrouter.ai/keys. Free models switch automatically; free keys get 50 requests a day across all free models (1,000 after buying $10 of credits). Web search is never free.",
  },
  {
    key: "tavily",
    label: "Tavily (web search)",
    baseUrl: "https://api.tavily.com",
    needsKey: true,
    models: [],
    hint: "Key from app.tavily.com (free plan: 1,000 searches a month, no card). Not an AI: it finds pages about a company's owners and managers, and a free AI model reads them. Used by Research with AI.",
  },
  {
    key: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    models: [],
    hint: "Key from platform.openai.com. Type the model name exactly as OpenAI lists it.",
  },
  {
    key: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    needsKey: true,
    models: [],
    hint: "Key from Google AI Studio. Type the model name exactly as Google lists it.",
  },
  {
    key: "openai_compatible",
    label: "Other (OpenAI-compatible)",
    baseUrl: "",
    needsKey: false,
    models: [],
    hint: "Any service with an OpenAI-style API (OpenRouter, Groq, DeepSeek, a self-hosted server). Enter its base URL.",
  },
  {
    key: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434",
    needsKey: false,
    models: ["qwen3.5:4b"],
    hint: "Runs on this computer only, slowly (no GPU). Not available on the production server.",
  },
] as const;
export type AiProviderKey = (typeof AI_PROVIDERS)[number]["key"];
export const aiProvider = (k: string) => AI_PROVIDERS.find((p) => p.key === k);
export const isAiProvider = (k: string): k is AiProviderKey => AI_PROVIDERS.some((p) => p.key === k);
/** A web search service: it returns pages, not answers, so it has no model and an AI reads what it finds. */
export const isSearchService = (k: string) => k === "tavily";

export const AI_USES = [
  { key: "research", label: "Research notes", hint: "Summarise a company's website and news" },
  { key: "writing", label: "Email drafts", hint: "Suggest the personal line and first email" },
  { key: "replies", label: "Sorting replies", hint: "Tell interested, not now, out of office and unsubscribe apart" },
] as const;
export type AiUse = (typeof AI_USES)[number]["key"];
