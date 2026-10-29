import { visitorSays } from "@/lib/webchat/chats";
import { visitorPost } from "@/lib/webchat/handler";
import { cleanString, preflight } from "@/lib/webchat/public";
import { MAX_WEB_BODY } from "@/lib/webchat/types";

/** A line from the visitor. */
export const POST = visitorPost(
  async ({ chat, body }) => {
    const text = cleanString(body.body, MAX_WEB_BODY);
    if (!text) throw new Error("Write a message first.");
    return { message: await visitorSays(chat, text) };
  },
  { max: 30, windowMs: 60_000 },
);

export const OPTIONS = preflight;
