import { z } from "zod";

export const CATEGORIES = [
  "laptop",
  "desktop",
  "workstation",
  "all-in-one",
  "monitor",
  "accessory",
  "component",
  "printer",
  "networking",
  "storage",
  "other",
] as const;

export const CONDITIONS = ["new", "used", "refurbished", "open-box"] as const;

const s = (max: number) => z.string().max(max);

/**
 * What the model returns per product. Kept small on purpose: on a CPU-only server output tokens
 * dominate run time. currency / condition / stock note are detected by rules from the block text.
 * maxLength caps stop a small model from rambling inside a field.
 */
export const llmOutItemSchema = z.object({
  block: z.number().int(),
  category: z.enum(CATEGORIES),
  brand: s(30),
  model_name: s(60),
  part_number: s(30),
  cpu: s(40),
  ram: s(12),
  storage: s(30),
  display: s(40),
  gpu: s(30),
  os: s(25),
  extras: s(80),
  price: z.number().nullable(),
});

export const llmOutSchema = z.object({ items: z.array(llmOutItemSchema) });

/** JSON schema handed to Ollama's `format` field so output is grammar-constrained. */
export const llmOutJsonSchema = z.toJSONSchema(llmOutSchema, { target: "draft-7" });

/** Lenient parse: trims over-long strings instead of rejecting the whole batch. */
export const llmOutLenientSchema = z.object({
  items: z.array(
    z.object({
      block: z.coerce.number().int(),
      category: z.string().catch("other"),
      brand: z.string().catch(""),
      model_name: z.string().catch(""),
      part_number: z.string().catch(""),
      cpu: z.string().catch(""),
      ram: z.string().catch(""),
      storage: z.string().catch(""),
      display: z.string().catch(""),
      gpu: z.string().catch(""),
      os: z.string().catch(""),
      extras: z.string().catch(""),
      price: z.union([z.number(), z.string(), z.null()]).catch(null),
    }),
  ),
});

export interface LlmItem {
  block: number;
  category: (typeof CATEGORIES)[number];
  brand: string;
  model_name: string;
  part_number: string;
  cpu: string;
  ram: string;
  storage: string;
  display: string;
  gpu: string;
  os: string;
  extras: string;
  condition: (typeof CONDITIONS)[number];
  price: number | null;
  currency: string;
  stock_note: string;
}

export function parsePrice(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const CURRENCY_RE = /\b(USD|EUR|GBP|SAR|INR|AED)\b|(\$)|(€)|(£)/i;
const STOCK_RE =
  /\b(limited stocks?|last \d+ ?(?:pcs|units)?|\d+ ?(?:pcs|units|nos)\b|qty:? ?\d+|eta[^|\n]{0,20}|out of stock|in stock|on order)/i;

/** Adds the rule-based fields to what the model returned. */
export function completeItem(
  it: z.infer<typeof llmOutLenientSchema>["items"][number],
  blockText: string,
): LlmItem {
  const cur = blockText.match(CURRENCY_RE);
  const currency = cur ? (cur[1]?.toUpperCase() ?? (cur[2] ? "USD" : cur[3] ? "EUR" : "GBP")) : "AED";
  const condition: LlmItem["condition"] = /refurb/i.test(blockText)
    ? "refurbished"
    : /open[- ]?box/i.test(blockText)
      ? "open-box"
      : /\b(used|pre-?owned|second[- ]hand)\b/i.test(blockText)
        ? "used"
        : "new";
  const stock = blockText.match(STOCK_RE);
  const cat = it.category.toLowerCase();
  return {
    block: it.block,
    category: ((CATEGORIES as readonly string[]).includes(cat) ? cat : "other") as LlmItem["category"],
    brand: it.brand,
    model_name: it.model_name,
    part_number: it.part_number,
    cpu: it.cpu,
    ram: it.ram,
    storage: it.storage,
    display: it.display,
    gpu: it.gpu,
    os: it.os,
    extras: it.extras,
    condition,
    price: parsePrice(it.price),
    currency,
    stock_note: stock ? stock[0] : "",
  };
}

/** A parsed row after post-processing, as shown in the review grid and saved as an offer. */
export const offerDraftSchema = z.object({
  key: z.string(),
  category: z.enum(CATEGORIES),
  brand: z.string(),
  modelName: z.string(),
  partNumber: z.string(),
  cpu: z.string(),
  ramGb: z.number().int().nullable(),
  storage: z.string(),
  display: z.string(),
  gpu: z.string(),
  os: z.string(),
  extras: z.string(),
  condition: z.enum(CONDITIONS),
  price: z.number().nullable(),
  currency: z.string(),
  /** "FOB JA", "ex-VAT" ... what the price is quoted on. Empty = as quoted. */
  priceBasis: z.string().default(""),
  stockNote: z.string(),
  rawText: z.string(),
  confidence: z.number().min(0).max(1),
  flags: z.array(z.string()),
  /** Product chosen in review: an existing product id, or null to auto-match / create on save. */
  productId: z.number().int().nullable(),
  /** Label of the product chosen/matched, shown in the review grid. */
  productLabel: z.string().default(""),
  /** Similar existing product found by fuzzy search (not applied until the user accepts). */
  suggestedProductId: z.number().int().nullable().default(null),
  suggestedLabel: z.string().default(""),
  include: z.boolean(),
});

export type OfferDraft = z.infer<typeof offerDraftSchema>;
