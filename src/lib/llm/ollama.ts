import type { ExtractRequest, LlmProvider } from "./provider";

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  numCtx?: number;
  keepAlive?: string;
  timeoutMs?: number;
  /** Aborts an in-flight request (used when an admin presses Stop). */
  signal?: AbortSignal;
}

export class OllamaProvider implements LlmProvider {
  name = "ollama";
  model: string;
  private opts: Required<Omit<OllamaOptions, "signal">> & Pick<OllamaOptions, "signal">;

  constructor(opts: OllamaOptions) {
    this.opts = { numCtx: 4096, keepAlive: "5m", timeoutMs: 180_000, ...opts };
    this.model = opts.model;
  }

  async extractJson({ messages, jsonSchema, maxTokens }: ExtractRequest): Promise<unknown> {
    const res = await fetch(`${this.opts.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: this.opts.signal
        ? AbortSignal.any([AbortSignal.timeout(this.opts.timeoutMs), this.opts.signal])
        : AbortSignal.timeout(this.opts.timeoutMs),
      body: JSON.stringify({
        model: this.opts.model,
        messages,
        stream: false,
        format: jsonSchema,
        think: false,
        keep_alive: this.opts.keepAlive,
        options: { temperature: 0, num_ctx: this.opts.numCtx, ...(maxTokens ? { num_predict: maxTokens } : {}) },
      }),
    });
    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      prompt_eval_duration?: number;
      eval_count?: number;
      eval_duration?: number;
    };
    if (process.env.LLM_DEBUG === "true") {
      const s = (ns?: number) => ((ns ?? 0) / 1e9).toFixed(1);
      console.error(
        `[ollama] prompt ${data.prompt_eval_count ?? 0} tok in ${s(data.prompt_eval_duration)}s, ` +
          `output ${data.eval_count ?? 0} tok in ${s(data.eval_duration)}s`,
      );
    }
    const content = data.message?.content ?? "";
    try {
      return JSON.parse(content);
    } catch {
      throw new Error(`Model returned invalid JSON: ${content.slice(0, 200)}`);
    }
  }

  /** Names of the models Ollama holds in memory right now. /api/ps only reports; it never loads anything. */
  private async loadedNames(): Promise<string[]> {
    try {
      const res = await fetch(`${this.opts.baseUrl}/api/ps`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: { name: string }[] };
      return (data.models ?? []).map((m) => m.name);
    } catch {
      return [];
    }
  }

  async isLoaded() {
    return (await this.loadedNames()).length > 0;
  }

  async unload() {
    // only models that are really loaded: a keep_alive 0 request for an unloaded model could load it first
    for (const name of await this.loadedNames()) {
      await fetch(`${this.opts.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ model: name, keep_alive: 0 }),
      }).catch(() => undefined);
    }
  }

  async health() {
    try {
      const res = await fetch(`${this.opts.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      const has = names.some((n) => n === this.model || n === `${this.model}:latest`);
      return has
        ? { ok: true, detail: `${this.model} ready` }
        : { ok: false, detail: `Model ${this.model} not pulled. Available: ${names.join(", ") || "none"}` };
    } catch (e) {
      return { ok: false, detail: `Ollama unreachable at ${this.opts.baseUrl}: ${(e as Error).message}` };
    }
  }
}
