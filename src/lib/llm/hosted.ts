import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AiUnavailable, askProvider, type ProviderRow } from "@/lib/prospecting/ai-client";
import { LlmUnavailable, type ChatMessage, type ExtractRequest, type LlmProvider } from "./provider";

/**
 * Reads price lists with an AI service saved under Prospecting → Settings (OpenRouter free models, Claude, OpenAI...).
 * The same key, free-model switching and daily allowance are shared with Prospecting.
 */
export class HostedProvider implements LlmProvider {
  name: string;
  model: string;
  // free models answered 8-block batches but sent empty replies for 20 (tested 2026-11-03); each request counts
  // against the key's 50 free requests a day
  batch = { blocks: 8, chars: 1600 };
  counted = true;

  constructor(private row: ProviderRow) {
    this.name = row.provider;
    this.model = row.label;
  }

  async extractJson({ messages, maxTokens }: ExtractRequest): Promise<unknown> {
    let text: string;
    try {
      // room for a short think on top of the answer
      ({ text } = await askProvider(this.row, flatten(messages), { search: false, json: true, maxTokens: Math.min(16_000, (maxTokens ?? 3000) + 1500) }));
    } catch (e) {
      if (e instanceof AiUnavailable) throw new LlmUnavailable(`${this.row.label}: ${e.message}`);
      throw e;
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    try {
      if (start < 0 || end <= start) throw new Error();
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      throw new Error(`Model returned invalid JSON: ${text.slice(0, 200)}`);
    }
  }

  async health() {
    const [p] = await db.select().from(schema.prospectAiProviders).where(eq(schema.prospectAiProviders.id, this.row.id));
    if (!p?.enabled) return { ok: false, detail: `${this.row.label} is switched off in Prospecting → Settings` };
    if (p.outUntil && p.outUntil > new Date()) return { ok: false, detail: `${p.label}: allowance used up for now` };
    const left = p.provider === "openrouter" && p.usage ? ` · ${p.usage.remaining} of ${p.usage.limit} free requests left today` : "";
    return { ok: true, detail: `${p.label} ready${left}` };
  }

  async isLoaded() {
    return false;
  }

  async unload() {}
}

/** One prompt for services that take a single message: the rules, the worked examples, then the list to read. */
function flatten(messages: ChatMessage[]): string {
  const out: string[] = [];
  for (const m of messages) {
    if (m.role === "system") out.push(m.content);
    else if (m.role === "assistant") out.push(`Example output:\n${m.content}`);
    else out.push(m === messages.at(-1) ? `Now read this input. Reply with JSON only, no other text, shaped like the example output.\n\n${m.content}` : `Example input:\n${m.content}`);
  }
  return out.join("\n\n");
}
