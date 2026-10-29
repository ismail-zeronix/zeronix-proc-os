import { saveFeedback } from "@/lib/webchat/chats";
import { visitorPost } from "@/lib/webchat/handler";
import { cleanString, preflight } from "@/lib/webchat/public";

/** Stars, feedback chips and a comment, after the chat has ended. */
export const POST = visitorPost(
  async ({ chat, body }) => {
    const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string").slice(0, 8) : [];
    await saveFeedback(chat, Number(body.rating), tags, cleanString(body.comment, 1000));
    return { ok: true };
  },
  { max: 10, windowMs: 60 * 60_000 },
);

export const OPTIONS = preflight;
