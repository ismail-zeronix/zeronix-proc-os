import "server-only";
import { and, asc, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { aiProvider } from "./ai";
import { cooldownMinutes, nextUtcMidnight, pickFreeModels, type CatalogModel } from "./free-models";

export type ProviderRow = typeof schema.prospectAiProviders.$inferSelect;

/** Why a provider could not answer: "quota" = out for today (try another provider), "busy" = try again later. */
export class AiUnavailable extends Error {
  constructor(
    public reason: "quota" | "busy" | "setup",
    message: string,
  ) {
    super(message);
  }
}

export interface AiReply {
  text: string;
  tokens: number;
  /** The model that actually answered (with automatic switching it can differ from the first choice). */
  model: string;
}

/** Can this provider search the web for research? (Others would have to guess.) */
export function canSearch(p: Pick<ProviderRow, "provider" | "paidSearch">): boolean {
  return p.provider === "gemini" || p.provider === "anthropic" || (p.provider === "openrouter" && p.paidSearch);
}

const OPENROUTER_HEADERS = { "HTTP-Referer": "https://www.zeronix.ae", "X-OpenRouter-Title": "Zeronix Portal" };
/** OpenRouter tries these in order inside one request when one is busy or rate limited. */
const MODELS_PER_REQUEST = 3;

function keyOf(p: ProviderRow): string {
  if (!p.apiKeyEnc) return "";
  try {
    return decryptSecret(p.apiKeyEnc);
  } catch {
    throw new AiUnavailable("setup", "The saved key can no longer be read. Edit the provider and enter it again.");
  }
}

const baseOf = (p: ProviderRow) => (p.baseUrl || aiProvider(p.provider)?.baseUrl || "").replace(/\/+$/, "");

// ---------- OpenRouter ----------

export interface OpenRouterAllowance {
  used: number;
  limit: number;
  remaining: number;
  freeTier: boolean;
}

/** The key's free-model allowance for today (UTC day). Costs nothing. */
export async function openRouterAllowance(apiKey: string, base = "https://openrouter.ai/api/v1"): Promise<OpenRouterAllowance | null> {
  const res = await fetch(`${base}/key`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const d = ((await res.json().catch(() => null)) as { data?: { is_free_tier?: boolean; free_model_daily_requests?: { used?: number; limit?: number; remaining?: number } } } | null)?.data;
  const f = d?.free_model_daily_requests;
  if (!f) return null;
  return { used: f.used ?? 0, limit: f.limit ?? 0, remaining: f.remaining ?? 0, freeTier: !!d?.is_free_tier };
}

async function saveAllowance(providerId: number, a: OpenRouterAllowance | null) {
  if (!a) return;
  await db
    .update(schema.prospectAiProviders)
    .set({ usage: { used: a.used, limit: a.limit, remaining: a.remaining, checkedAt: new Date().toISOString() }, outUntil: a.remaining <= 0 ? nextUtcMidnight() : null })
    .where(eq(schema.prospectAiProviders.id, providerId));
}

/** Reloads the free-model list from OpenRouter's catalogue, keeping people's on/off choices. Returns how many. */
export async function refreshFreeModels(p: ProviderRow, today: string): Promise<number> {
  const res = await fetch(`${baseOf(p)}/models?max_price=0&max_output_price=0`, { headers: { Authorization: `Bearer ${keyOf(p)}` }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) throw new AiUnavailable("busy", `OpenRouter answered ${res.status} for its model list.`);
  const catalog = (((await res.json()) as { data?: CatalogModel[] }).data ?? []) as CatalogModel[];
  const free = pickFreeModels(catalog, today);
  await db.transaction(async (tx) => {
    for (const [i, m] of free.entries()) {
      await tx
        .insert(schema.prospectAiModels)
        .values({ providerId: p.id, ...m, position: i })
        .onConflictDoUpdate({ target: [schema.prospectAiModels.providerId, schema.prospectAiModels.modelId], set: { name: m.name, contextLength: m.contextLength, json: m.json, expiresOn: m.expiresOn, position: i } });
    }
    const keep = free.map((m) => m.modelId);
    // models OpenRouter no longer offers for free are dropped
    await tx
      .delete(schema.prospectAiModels)
      .where(and(eq(schema.prospectAiModels.providerId, p.id), keep.length ? sql`${schema.prospectAiModels.modelId} NOT IN (${sql.join(keep.map((k) => sql`${k}`), sql`, `)})` : undefined));
    await tx.update(schema.prospectAiProviders).set({ modelsRefreshedAt: new Date() }).where(eq(schema.prospectAiProviders.id, p.id));
  });
  return free.length;
}

/**
 * Free models to try next: models that have answered well before come first, least recently used first among them, so
 * the work is spread over the good models instead of wearing one out (a model rate-limited upstream stays limited for
 * a while); untried models come after. Resting and switched-off models are left out.
 */
async function readyModels(providerId: number, skip: string[], json = false): Promise<string[]> {
  const rows = await db
    .select({ modelId: schema.prospectAiModels.modelId })
    .from(schema.prospectAiModels)
    .where(
      and(
        eq(schema.prospectAiModels.providerId, providerId),
        eq(schema.prospectAiModels.enabled, true),
        or(isNull(schema.prospectAiModels.cooldownUntil), lt(schema.prospectAiModels.cooldownUntil, new Date())),
        skip.length ? notInArray(schema.prospectAiModels.modelId, skip) : undefined,
      ),
    )
    // JSON-mode models first when the caller needs strict JSON
    .orderBy(...(json ? [sql`${schema.prospectAiModels.json} desc`] : []), sql`(${schema.prospectAiModels.okCount} > 0) desc`, sql`${schema.prospectAiModels.lastUsedAt} asc nulls first`, asc(schema.prospectAiModels.position))
    .limit(MODELS_PER_REQUEST);
  return rows.map((r) => r.modelId);
}

/** Rests models that just failed, longer each time they fail in a row, so the next calls go to other models. */
export async function restModels(providerId: number, modelIds: string[], error: string) {
  if (!modelIds.length) return;
  const rows = await db
    .select({ id: schema.prospectAiModels.id, failCount: schema.prospectAiModels.failCount })
    .from(schema.prospectAiModels)
    .where(and(eq(schema.prospectAiModels.providerId, providerId), inArray(schema.prospectAiModels.modelId, modelIds)));
  for (const r of rows) {
    const fails = r.failCount + 1;
    await db
      .update(schema.prospectAiModels)
      .set({ failCount: fails, lastError: error.slice(0, 300), cooldownUntil: new Date(Date.now() + cooldownMinutes(fails) * 60_000), lastUsedAt: new Date() })
      .where(eq(schema.prospectAiModels.id, r.id));
  }
}

/** How many sets of free models one call may go through before giving up on the provider. */
const ROUNDS = 3;
/** OpenRouter's per-minute limit on free models: pause the provider this long. */
const MINUTE_PAUSE_MS = 65_000;

type ChatBody = {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { total_tokens?: number };
  error?: { message?: string; code?: number; metadata?: { raw?: string } };
} | null;

async function postChat(p: ProviderRow, apiKey: string, models: string[], prompt: string, search: boolean, maxTokens: number, json = false) {
  const isRouter = p.provider === "openrouter";
  const res = await fetch(`${baseOf(p)}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...(isRouter ? OPENROUTER_HEADERS : {}) },
    body: JSON.stringify({
      model: models[0],
      ...(isRouter && models.length > 1 ? { models } : {}),
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0,
      ...(json ? { response_format: { type: "json_object" } } : {}),
      // many free models think before answering; keep that short and out of the reply, or it uses up max_tokens
      ...(isRouter ? { reasoning: { effort: "low", exclude: true } } : {}),
      ...(isRouter && search ? { plugins: [{ id: "web", max_results: 5 }] } : {}),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json().catch(() => null)) as ChatBody;
  const message = [body?.error?.message, body?.error?.metadata?.raw].filter(Boolean).join(": ");
  return { res, body, message };
}

function replyOf(body: ChatBody, fallbackModel: string): AiReply {
  return { text: body?.choices?.[0]?.message?.content ?? "", tokens: body?.usage?.total_tokens ?? 0, model: body?.model ?? fallbackModel };
}

/**
 * OpenRouter free models with automatic switching. Each request names a few models (OpenRouter falls through them);
 * when they all fail, they rest and the next few least-used models are tried, up to ROUNDS times. Limits on the whole
 * key are told apart from a busy model: the daily allowance stops the provider until it resets, the per-minute limit
 * pauses it for a minute, and neither rests the models (they did nothing wrong).
 */
async function openRouterFree(p: ProviderRow, prompt: string, search: boolean, maxTokens: number, json = false): Promise<AiReply> {
  const apiKey = keyOf(p);
  const tried: string[] = [];
  const problems: string[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const models = await readyModels(p.id, tried, json);
    if (!models.length) break;
    tried.push(...models);
    const { res, body, message } = await postChat(p, apiKey, models, prompt, search, maxTokens, json);
    if (res.ok) {
      const reply = replyOf(body, models[0]);
      // an empty answer (a thinking model that used up its tokens, or a broken upstream) is no answer: try other models
      if (!reply.text.trim()) {
        await restModels(p.id, [reply.model], "Empty reply");
        problems.push(`${reply.model}: empty reply`);
        continue;
      }
      await db
        .update(schema.prospectAiModels)
        .set({ okCount: sql`${schema.prospectAiModels.okCount} + 1`, failCount: 0, lastError: "", cooldownUntil: null, lastUsedAt: new Date() })
        .where(and(eq(schema.prospectAiModels.providerId, p.id), eq(schema.prospectAiModels.modelId, reply.model)));
      // keep "x of 50 used today" current; this call is free
      void openRouterAllowance(apiKey, baseOf(p)).then((a) => saveAllowance(p.id, a)).catch(() => {});
      return reply;
    }
    if (res.status === 402) throw new AiUnavailable("quota", "OpenRouter has no credits for this (web search is paid).");
    if (res.status === 401 || res.status === 403) throw new AiUnavailable("setup", `OpenRouter refused the key (${res.status}). Check it in Settings.`);
    if (res.status === 429 && /per-day/i.test(message)) {
      const allowance = await openRouterAllowance(apiKey, baseOf(p));
      await saveAllowance(p.id, allowance ?? { used: 0, limit: 0, remaining: 0, freeTier: true });
      throw new AiUnavailable("quota", `OpenRouter's free allowance for today is used up${allowance ? ` (${allowance.used} of ${allowance.limit})` : ""}; it comes back at 04:00 Dubai time.`);
    }
    if (res.status === 429 && /per-min/i.test(message)) {
      await db.update(schema.prospectAiProviders).set({ outUntil: new Date(Date.now() + MINUTE_PAUSE_MS) }).where(eq(schema.prospectAiProviders.id, p.id));
      throw new AiUnavailable("busy", "OpenRouter's limit of free requests a minute was reached; it continues in a minute.");
    }
    // the models themselves failed (rate limited upstream, down, or refused the request): rest them, try others
    await restModels(p.id, models, message || `HTTP ${res.status}`);
    problems.push(`${models.join(", ")}: ${(message || `HTTP ${res.status}`).slice(0, 120)}`);
  }
  if (!tried.length) throw new AiUnavailable("busy", "No free model is available right now; they are all resting after errors.");
  throw new AiUnavailable("busy", `${tried.length} free models tried, none answered (${problems.at(-1) ?? "no details"}).`);
}

/** OpenAI-style chat: OpenRouter, OpenAI and compatible services with one fixed model. */
async function chatCompletions(p: ProviderRow, prompt: string, search: boolean, maxTokens: number, json = false): Promise<AiReply> {
  if (p.provider === "openrouter" && p.autoFree) return openRouterFree(p, prompt, search, maxTokens, json);
  const apiKey = keyOf(p);
  const { res, body, message } = await postChat(p, apiKey, [p.model], prompt, search, maxTokens, json);
  const label = aiProvider(p.provider)?.label ?? p.provider;
  if (res.status === 402) throw new AiUnavailable("quota", `${label} has no credits left for this.`);
  if (res.status === 429) {
    if (p.provider === "openrouter") {
      const allowance = await openRouterAllowance(apiKey, baseOf(p));
      await saveAllowance(p.id, allowance);
      if (allowance && allowance.remaining <= 0) throw new AiUnavailable("quota", `OpenRouter's allowance for today is used up (${allowance.used} of ${allowance.limit}).`);
    }
    throw new AiUnavailable("busy", `${label} is over its rate limit. Try again later.`);
  }
  if (!res.ok) throw new AiUnavailable("busy", `${label} answered ${res.status}: ${message.slice(0, 200) || "no details"}`);
  return replyOf(body, p.model);
}

// ---------- Web search (Tavily) ----------

export interface SearchHit {
  url: string;
  title: string;
  content: string;
}

/** Searches the web with a search service (no AI): result pages with a short extract of each. */
export async function webSearch(p: ProviderRow, query: string): Promise<SearchHit[]> {
  if (p.provider !== "tavily") throw new AiUnavailable("setup", "This provider is not a search service.");
  const res = await fetch(`${baseOf(p)}/search`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${keyOf(p)}` },
    body: JSON.stringify({ query, max_results: 6, search_depth: "basic", include_answer: false }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as { results?: { url?: string; title?: string; content?: string }[]; detail?: { error?: string } | string } | null;
  const detail = typeof body?.detail === "string" ? body.detail : (body?.detail?.error ?? "");
  // 432/433: the plan's monthly credits are used up
  if (res.status === 429 || res.status === 432 || res.status === 433) throw new AiUnavailable("quota", `Tavily's search allowance is used up${detail ? `: ${detail.slice(0, 120)}` : ""}.`);
  if (res.status === 401) throw new AiUnavailable("setup", "Tavily refused the key. Check it in Settings.");
  if (!res.ok) throw new AiUnavailable("busy", `Tavily answered ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  await countSearch(p);
  return (body?.results ?? [])
    .filter((r) => typeof r.url === "string" && /^https?:\/\//i.test(r.url))
    .map((r) => ({ url: r.url!, title: String(r.title ?? "").slice(0, 200), content: String(r.content ?? "").slice(0, 1500) }));
}

/** Keeps "x of y searches today" on a search provider (its daily limit is checked against this). */
async function countSearch(p: ProviderRow) {
  const today = new Date().toISOString().slice(0, 10);
  const used = (p.usage?.checkedAt?.slice(0, 10) === today ? p.usage.used : 0) + 1;
  await db
    .update(schema.prospectAiProviders)
    .set({ usage: { used, limit: p.dailyLimit, remaining: Math.max(0, p.dailyLimit - used), checkedAt: new Date().toISOString() } })
    .where(eq(schema.prospectAiProviders.id, p.id));
}

/** Searches a search provider has made today (UTC day, as it counts them). */
export function searchesToday(p: ProviderRow): number {
  return p.usage?.checkedAt?.slice(0, 10) === new Date().toISOString().slice(0, 10) ? p.usage.used : 0;
}

// ---------- Gemini and Claude ----------

async function gemini(p: ProviderRow, prompt: string, search: boolean, maxTokens: number): Promise<AiReply> {
  const res = await fetch(`${baseOf(p)}/models/${encodeURIComponent(p.model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": keyOf(p) },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], ...(search ? { tools: [{ google_search: {} }] } : {}), generationConfig: { temperature: 0, maxOutputTokens: maxTokens } }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { totalTokenCount?: number }; error?: { message?: string } } | null;
  if (res.status === 429)
    throw new AiUnavailable("quota", search ? "Gemini has no quota left for Google Search. Search needs billing switched on for this API key's Google Cloud project (free keys cannot search)." : "Gemini's quota is used up for now.");
  if (res.status === 503) throw new AiUnavailable("busy", "Gemini is busy right now. Try again later.");
  if (!res.ok) throw new AiUnavailable("busy", `Gemini answered ${res.status}: ${body?.error?.message?.slice(0, 200) ?? "no details"}`);
  return { text: (body?.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join(""), tokens: body?.usageMetadata?.totalTokenCount ?? 0, model: p.model };
}

async function claude(p: ProviderRow, prompt: string, search: boolean, maxTokens: number): Promise<AiReply> {
  const res = await fetch(`${baseOf(p)}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": keyOf(p), "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: p.model,
      max_tokens: maxTokens,
      ...(search ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }] } : {}),
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } } | null;
  if (res.status === 429 || res.status === 529) throw new AiUnavailable("busy", "Claude is busy or over its rate limit. Try again later.");
  if (!res.ok) throw new AiUnavailable("busy", `Claude answered ${res.status}: ${body?.error?.message?.slice(0, 200) ?? "no details"}`);
  return {
    text: (body?.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
    tokens: (body?.usage?.input_tokens ?? 0) + (body?.usage?.output_tokens ?? 0),
    model: p.model,
  };
}

/** Sends one prompt to one provider. `search` asks it to search the web (only for providers where canSearch is true). */
export async function askProvider(p: ProviderRow, prompt: string, opts: { search: boolean; maxTokens?: number; json?: boolean }): Promise<AiReply> {
  // room for a short think plus the answer: thinking models stop mid-answer when this is too low
  const maxTokens = opts.maxTokens ?? 3000;
  if (opts.search && !canSearch(p)) throw new AiUnavailable("setup", "This provider cannot search the web.");
  if (p.outUntil && p.outUntil > new Date()) throw new AiUnavailable("quota", `Paused until ${p.outUntil.toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" })} (allowance or rate limit).`);
  if (p.provider === "gemini") return gemini(p, prompt, opts.search, maxTokens);
  if (p.provider === "anthropic") return claude(p, prompt, opts.search, maxTokens);
  if (p.provider === "ollama") throw new AiUnavailable("setup", "Ollama is not used for research.");
  if (p.provider === "tavily") throw new AiUnavailable("setup", "Tavily searches the web; it does not answer prompts.");
  if (!p.autoFree && !p.model) throw new AiUnavailable("setup", "Pick a model first.");
  return chatCompletions(p, prompt, opts.search, maxTokens, opts.json);
}

/** Reloads the free-model list of every OpenRouter provider not refreshed in the last day (called by the worker). */
export async function refreshStaleFreeModels(today: string): Promise<void> {
  const stale = await db
    .select()
    .from(schema.prospectAiProviders)
    .where(
      and(
        eq(schema.prospectAiProviders.provider, "openrouter"),
        eq(schema.prospectAiProviders.autoFree, true),
        eq(schema.prospectAiProviders.enabled, true),
        or(isNull(schema.prospectAiProviders.modelsRefreshedAt), lt(schema.prospectAiProviders.modelsRefreshedAt, new Date(Date.now() - 24 * 3600_000))),
      ),
    );
  for (const p of stale) {
    try {
      const n = await refreshFreeModels(p, today);
      console.log(`[research] ${p.label}: ${n} free models`);
    } catch (e) {
      console.error(`[research] ${p.label}: free model refresh failed`, (e as Error).message);
    }
  }
}
