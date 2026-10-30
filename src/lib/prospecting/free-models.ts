/** Which OpenRouter models count as free and usable for text work, and in what order to try them. Pure rules. */

export interface CatalogModel {
  id: string;
  name?: string;
  context_length?: number;
  expiration_date?: string | null;
  pricing?: Record<string, string | undefined>;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
}

export interface FreeModel {
  modelId: string;
  name: string;
  contextLength: number;
  json: boolean;
  expiresOn: string | null;
}

/** Safety classifiers, embedders and the like answer something other than a reply. */
const NOT_CHAT = /safety|guard|moderation|embed|rerank|whisper|tts|lyria|music|image/i;
const zero = (v: string | undefined) => v === undefined || Number(v) === 0;

/** Free (every price 0), text in and text out, not expiring within `days`, and an actual chat model. Best first. */
export function pickFreeModels(catalog: CatalogModel[], today: string, days = 3): FreeModel[] {
  const soon = Date.parse(today) + days * 86400_000;
  return catalog
    .filter((m) => m.pricing && zero(m.pricing.prompt) && zero(m.pricing.completion) && zero(m.pricing.request))
    .filter((m) => {
      const out = m.architecture?.output_modalities ?? ["text"];
      const inp = m.architecture?.input_modalities ?? ["text"];
      return out.length === 1 && out[0] === "text" && inp.includes("text");
    })
    .filter((m) => !NOT_CHAT.test(`${m.id} ${m.name ?? ""}`))
    .filter((m) => !m.expiration_date || Date.parse(m.expiration_date) > soon)
    .map((m) => ({
      modelId: m.id,
      name: (m.name ?? m.id).slice(0, 120),
      contextLength: m.context_length ?? 0,
      json: (m.supported_parameters ?? []).includes("response_format"),
      expiresOn: m.expiration_date ? m.expiration_date.slice(0, 10) : null,
    }))
    // JSON mode first (our replies are JSON), then the longest context (room for whole web pages), then name
    .sort((a, b) => Number(b.json) - Number(a.json) || b.contextLength - a.contextLength || a.modelId.localeCompare(b.modelId));
}

/** When OpenRouter's free allowance comes back: the next 00:00 UTC. */
export function nextUtcMidnight(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** How long a model rests after failing: 10 minutes, doubling with each failure in a row, at most a day. */
export function cooldownMinutes(failuresInARow: number): number {
  return Math.min(24 * 60, 10 * 2 ** Math.max(0, failuresInARow - 1));
}
