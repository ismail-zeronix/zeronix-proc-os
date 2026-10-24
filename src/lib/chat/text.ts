/** Small pure helpers used by both the chat server code and the widget. */

/** The longest message the chat accepts. */
export const MAX_BODY = 4000;

/** The DM key for two people: the same whichever of them starts it. */
export function dmKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Message text as people read it: `@[Ali](user:3)` becomes "@Ali", `#[ZQ-2026-0012](quote:4)` becomes "ZQ-2026-0012". */
export function tokensToText(body: string): string {
  return body.replace(/([@#])\[([^\]]+)\]\([a-z]+:\d+\)/g, (_m, sign: string, label: string) => (sign === "@" ? `@${label}` : label));
}

/** A short line for the conversation list and notifications. */
export function previewOf(kind: string, body: string): string {
  if (kind === "card" && !body) return "Shared a card";
  return tokensToText(body)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** The people mentioned in a text (`@[Name](user:12)`), each once, in order. */
export function parseMentions(body: string): number[] {
  const ids: number[] = [];
  for (const m of body.matchAll(/@\[[^\]]+\]\(user:(\d+)\)/g)) {
    const id = Number(m[1]);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** The records linked in a text (`#[ZQ-2026-0012](quote:4)` → "quote:4"), each once, in order. */
export function parseRecordRefs(body: string): string[] {
  const refs: string[] = [];
  for (const m of body.matchAll(/#\[[^\]]+\]\(([a-z]+:\d+)\)/g)) if (!refs.includes(m[1])) refs.push(m[1]);
  return refs;
}

/** Labels and tokens never contain these, so a name cannot break the markup. */
export const cleanLabel = (s: string) => s.replace(/[[\]()\n]/g, " ").replace(/\s+/g, " ").trim();
export const mentionToken = (id: number, name: string) => `@[${cleanLabel(name)}](user:${id})`;
export const recordToken = (ref: string, label: string) => `#[${cleanLabel(label)}](${ref})`;

/** What a timeline entry was, as a card header says it: "mentioned you in a call". */
export const EVENT_LABEL: Record<string, string> = {
  call: "in a call",
  whatsapp: "in a WhatsApp note",
  email: "in an email note",
  meeting: "in a meeting note",
  note: "in a note",
  task: "in a task",
  company: "in a company note",
  mention: "in a conversation",
};
