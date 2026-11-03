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
  /** Bigger batches than the local default (hosted models read a whole list in a few requests). */
  batch?: BatchLimits;
  /** Each request counts against a daily allowance: no second attempts or block-by-block re-asks (fine for a local model, not here). */
  counted?: boolean;
  extractJson(req: ExtractRequest): Promise<unknown>;
  health(): Promise<{ ok: boolean; detail: string }>;
  /** Is the model currently held in memory? Never loads it. */
  isLoaded(): Promise<boolean>;
  /** Frees the model's memory right away (no-op when it is not loaded). */
  unload(): Promise<void>;
}

/** How much of a price list goes into one request (fewer, bigger requests save a daily allowance). */
export interface BatchLimits {
  blocks: number;
  chars: number;
}

/** The AI service cannot answer right now (allowance used up, rate limited, key refused): the list waits and is tried again later. */
export class LlmUnavailable extends Error {}
