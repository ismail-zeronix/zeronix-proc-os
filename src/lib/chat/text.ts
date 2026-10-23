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
