import { saveContext } from "@/lib/webchat/chats";
import { visitorPost } from "@/lib/webchat/handler";
import { cleanString, preflight } from "@/lib/webchat/public";

/** What the visitor was looking at when a site opened the chat (window.ZeronixChat.open): a few short strings. */
export const POST = visitorPost(async ({ chat, body }) => {
  const raw = body.context && typeof body.context === "object" ? (body.context as Record<string, unknown>) : {};
  const context: Record<string, string> = {};
  for (const key of ["industry", "product", "category", "page", "cta", "landing", "referrer"]) {
    const v = cleanString(raw[key], 300);
    if (v) context[key] = v;
  }
  if (Object.keys(context).length) await saveContext(chat, context);
  return { ok: true };
}, { max: 30, windowMs: 60 * 60_000 });

export const OPTIONS = preflight;
