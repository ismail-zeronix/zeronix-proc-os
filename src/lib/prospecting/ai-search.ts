import "server-only";
import { aiProvider } from "./ai";

/** Providers that can search the web themselves; others would have to guess, so research never uses them. */
export const SEARCH_PROVIDERS = ["gemini", "anthropic"] as const;
export const canSearch = (provider: string) => (SEARCH_PROVIDERS as readonly string[]).includes(provider);

export interface SearchCall {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
}

/** Sends one prompt with web search switched on. Returns the reply text and the tokens it cost. */
export async function searchWithAi(c: SearchCall): Promise<{ text: string; tokens: number }> {
  const def = aiProvider(c.provider);
  if (!def || !canSearch(c.provider)) throw new Error("This provider cannot search the web.");
  const base = (c.baseUrl || def.baseUrl).replace(/\/+$/, "");
  const signal = AbortSignal.timeout(90_000);

  if (c.provider === "gemini") {
    const res = await fetch(`${base}/models/${encodeURIComponent(c.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": c.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: c.prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      }),
      signal,
    });
    const body = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { totalTokenCount?: number };
      error?: { message?: string };
    } | null;
    if (res.status === 429) throw new Error("Gemini has no quota left for Google Search. Search needs billing switched on for this API key's Google Cloud project (free keys cannot search).");
    if (res.status === 503) throw new Error("Gemini is busy right now. Press Research again later.");
    if (!res.ok) throw new Error(`Gemini answered ${res.status}: ${body?.error?.message?.slice(0, 200) ?? "no details"}`);
    const text = (body?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return { text, tokens: body?.usageMetadata?.totalTokenCount ?? 0 };
  }

  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": c.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: c.model,
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: c.prompt }],
    }),
    signal,
  });
  const body = (await res.json().catch(() => null)) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
  } | null;
  if (res.status === 429 || res.status === 529) throw new Error("Claude is busy or over its rate limit. Press Research again later.");
  if (!res.ok) throw new Error(`Claude answered ${res.status}: ${body?.error?.message?.slice(0, 200) ?? "no details"}`);
  // with web search the reply has several text blocks; the JSON is in the last ones
  const text = (body?.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  return { text, tokens: (body?.usage?.input_tokens ?? 0) + (body?.usage?.output_tokens ?? 0) };
}
