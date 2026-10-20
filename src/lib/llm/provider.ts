export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ExtractRequest {
  messages: ChatMessage[];
  jsonSchema: object;
  /** Hard cap on generated tokens. */
  maxTokens?: number;
}

/** Anything that can turn chat messages into schema-constrained JSON. */
export interface LlmProvider {
  name: string;
  model: string;
  extractJson(req: ExtractRequest): Promise<unknown>;
  health(): Promise<{ ok: boolean; detail: string }>;
  /** Is the model currently held in memory? Never loads it. */
  isLoaded(): Promise<boolean>;
  /** Frees the model's memory right away (no-op when it is not loaded). */
  unload(): Promise<void>;
}
