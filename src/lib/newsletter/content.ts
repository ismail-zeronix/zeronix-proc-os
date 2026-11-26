import { normDoc } from "./blocks";
import { blankDoc, HTML_KEY, templateByKey } from "./templates";
import type { NewsDoc, NewsFields } from "./types";

/** What a stored newsletter contains: pasted HTML code, or a block design. Falls back to the template's own design when nothing was saved. */
export type Content = { html: string; doc?: undefined } | { doc: NewsDoc; html?: undefined };

export function contentOf(c: { templateKey: string; fields: unknown }): Content | null {
  const f = (c.fields ?? {}) as Partial<NewsFields>;
  if (c.templateKey === HTML_KEY) return typeof f.html === "string" ? { html: f.html } : null;
  const doc = normDoc(f.doc) ?? (templateByKey(c.templateKey)?.doc ? normDoc(templateByKey(c.templateKey)!.doc) : null) ?? (c.templateKey === "blank" ? blankDoc() : null);
  return doc ? { doc } : null;
}
