import "server-only";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
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

async function readyModels(providerId: number): Promise<string[]> {
  const rows = await db
    .select({ modelId: schema.prospectAiModels.modelId })
    .from(schema.prospectAiModels)
    .where(and(eq(schema.prospectAiModels.providerId, providerId), eq(schema.prospectAiModels.enabled, true), or(isNull(schema.prospectAiModels.cooldownUntil), lt(schema.prospectAiModels.cooldownUntil, new Date()))))
    .orderBy(asc(schema.prospectAiModels.position))
    .limit(MODELS_PER_REQUEST);
  return rows.map((r) => r.modelId);
}

/** Rests the models that just failed, longer each time they fail in a row. */
async function restModels(providerId: number, modelIds: string[], error: string) {
  if (!modelIds.length) return;
  const rows = await db
    .select({ id: schema.prospectAiModels.id, failCount: schema.prospectAiModels.failCount })
    .from(schema.prospectAiModels)
    .where(and(eq(schema.prospectAiModels.providerId, providerId), inArray(schema.prospectAiModels.modelId, modelIds)));
  for (const r of rows) {
    const fails = r.failCount + 1;
    await db
      .update(schema.prospectAiModels)
      .set({ failCount: fails, lastError: error.slice(0, 300), cooldownUntil: new Date(Date.now() + cooldownMinutes(fails) * 60_000) })
      .where(eq(schema.prospectAiModels.id, r.id));
  }
}

/** OpenAI-style chat: OpenRouter (with automatic model switching), OpenAI and compatible services. */
async function chatCompletions(p: ProviderRow, prompt: string, search: boolean, maxTokens: number): Promise<AiReply> {
  const apiKey = keyOf(p);
  const isRouter = p.provider === "openrouter";
  const models = isRouter && p.autoFree ? await readyModels(p.id) : [p.model];
  if (!models.length || !models[0]) throw new AiUnavailable("busy", "No free model is available right now; they are all resting after errors.");
  const res = await fetch(`${baseOf(p)}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...(isRouter ? OPENROUTER_HEADERS : {}) },
    body: JSON.stringify({
      model: models[0],
      ...(isRouter && models.length > 1 ? { models } : {}),
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0,
      ...(isRouter && search ? { plugins: [{ id: "web", max_results: 5 }] } : {}),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json().catch(() => null)) as {
    model?: string;
    choices?: { message?: { content?: string | null } }[];
    usage?: { total_tokens?: number };
    error?: { message?: string; code?: number };
  } | null;
  const message = body?.error?.message ?? "";
  if (res.status === 402) throw new AiUnavailable("quota", "OpenRouter has no credits for this (web search is paid).");
  if (res.status === 429 || res.status === 503 || res.status === 502) {
    if (isRouter) {
      const allowance = await openRouterAllowance(apiKey, baseOf(p));
      await saveAllowance(p.id, allowance);
      if (allowance && allowance.remaining <= 0) throw new AiUnavailable("quota", `OpenRouter's free allowance for today is used up (${allowance.used} of ${allowance.limit}); it comes back at 04:00 Dubai time.`);
      if (p.autoFree) await restModels(p.id, models, message || `HTTP ${res.status}`);
    }
    throw new AiUnavailable("busy", `${aiProvider(p.provider)?.label ?? p.provider} is busy (${res.status}). Try again later.`);
  }
  if (!res.ok) {
    if (isRouter && p.autoFree) await restModels(p.id, models.slice(0, 1), message || `HTTP ${res.status}`);
    throw new AiUnavailable("busy", `${aiProvider(p.provider)?.label ?? p.provider} answered ${res.status}: ${message.slice(0, 200) || "no details"}`);
  }
  const used = body?.model ?? models[0];
  if (isRouter && p.autoFree) {
    await db
      .update(schema.prospectAiModels)
      .set({ okCount: sql`${schema.prospectAiModels.okCount} + 1`, failCount: 0, lastError: "", cooldownUntil: null, lastUsedAt: new Date() })
      .where(and(eq(schema.prospectAiModels.providerId, p.id), eq(schema.prospectAiModels.modelId, used)));
    // keep "x of 50 used today" current; this call is free
    void openRouterAllowance(apiKey, baseOf(p)).then((a) => saveAllowance(p.id, a)).catch(() => {});
  }
  return { text: body?.choices?.[0]?.message?.content ?? "", tokens: body?.usage?.total_tokens ?? 0, model: used };
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
export async function askProvider(p: ProviderRow, prompt: string, opts: { search: boolean; maxTokens?: number }): Promise<AiReply> {
  const maxTokens = opts.maxTokens ?? 1024;
  if (opts.search && !canSearch(p)) throw new AiUnavailable("setup", "This provider cannot search the web.");
  if (p.outUntil && p.outUntil > new Date()) throw new AiUnavailable("quota", "Out of today's allowance.");
  if (p.provider === "gemini") return gemini(p, prompt, opts.search, maxTokens);
  if (p.provider === "anthropic") return claude(p, prompt, opts.search, maxTokens);
  if (p.provider === "ollama") throw new AiUnavailable("setup", "Ollama is not used for research.");
  if (!p.autoFree && !p.model) throw new AiUnavailable("setup", "Pick a model first.");
  return chatCompletions(p, prompt, opts.search, maxTokens);
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
