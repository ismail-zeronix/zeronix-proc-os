import type { SiteSpecTemplate } from "./types";

/**
 * A category's spec template as plain text, so it can be edited in one box:
 *
 *   Performance
 *     processor: Processor *
 *     memory: Memory *
 *   Display
 *     display: Display
 *
 * A line without indentation starts a group; an indented `key: Label` is a field; a trailing `*` makes it a filter.
 */
export function templateToText(t: SiteSpecTemplate): string {
  return t.groups.map((g) => [g.label, ...g.fields.map((f) => `  ${f.key}: ${f.label}${f.filter ? " *" : ""}`)].join("\n")).join("\n");
}

export function textToTemplate(text: string): SiteSpecTemplate {
  const groups: SiteSpecTemplate["groups"] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (!/^\s/.test(raw)) {
      groups.push({ label: raw.trim().slice(0, 60), fields: [] });
      continue;
    }
    const m = raw.trim().match(/^([a-zA-Z0-9_ -]+?)\s*:\s*(.+?)\s*(\*)?$/);
    if (!m) continue;
    if (!groups.length) groups.push({ label: "Specs", fields: [] });
    const key = m[1].toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (key) groups[groups.length - 1].fields.push({ key, label: m[2].slice(0, 60), filter: Boolean(m[3]) || undefined });
  }
  return { groups: groups.filter((g) => g.fields.length) };
}
