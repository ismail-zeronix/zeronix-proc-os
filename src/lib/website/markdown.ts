import matter from "gray-matter";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

/**
 * Markdown for the public site. The portal renders it once (here) and the site receives finished, sanitised HTML, so
 * the site needs no Markdown libraries and no uploaded file can put a script on zeronixtech.com. Headings get ids
 * (rehype-slug) for the table of contents; GitHub tables and lists work (remark-gfm).
 */

const schema = {
  ...defaultSchema,
  // keep the heading ids from rehype-slug (the default schema prefixes ids with "user-content-")
  clobberPrefix: "",
  attributes: { ...defaultSchema.attributes, "*": [...(defaultSchema.attributes?.["*"] ?? []), "id"] },
};

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeSlug).use(rehypeSanitize, schema).use(rehypeStringify);

export function renderMarkdown(md: string): string {
  if (!md.trim()) return "";
  return String(processor.processSync(md));
}

/** Front matter + body of an uploaded .md (claude-seo / Claude Blog output). Keys are made camelCase-insensitive. */
export function parseMarkdownFile(text: string): { data: Record<string, unknown>; body: string } {
  const { data, content } = matter(text.replace(/^﻿/, ""));
  return { data: normaliseKeys(data), body: content.trim() };
}

/** "meta_title", "metaTitle" and "Meta Title" all become "metatitle", so either style from the writing tools works. */
function normaliseKeys(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k.toLowerCase().replace(/[^a-z0-9]/g, "")] = v;
  return out;
}

// ---------- small readers for front-matter values (they come from hand-written YAML, so be forgiving) ----------

export const str = (v: unknown, max = 500): string => (typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, max) : "");

export const strList = (v: unknown, max = 40): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\s*,\s*/) : [])
    .map((x) => str(x, 300))
    .filter(Boolean)
    .slice(0, max);

export function faqList(v: unknown): { q: string; a: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .map((x) => ({ q: str(x.q ?? x.question, 300), a: str(x.a ?? x.answer, 2000) }))
    .filter((x) => x.q && x.a)
    .slice(0, 20);
}

/** "HP EliteBook 840 G11" → "hp-elitebook-840-g11". */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}
