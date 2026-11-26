import { z } from "zod";

/**
 * One supplier line before it is saved as an offer: what the Excel import, the live feeds and Claude's WhatsApp pushes
 * all produce, and what the review grid edits.
 */

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
