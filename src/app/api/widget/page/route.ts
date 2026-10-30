import { pageLeft } from "@/lib/webchat/chats";
import { visitorPost } from "@/lib/webchat/handler";
import { cleanString, preflight } from "@/lib/webchat/public";

/** Sent (as a beacon) when the visitor leaves a page: seconds spent on it and how far down they scrolled (%). */
export const POST = visitorPost(
  async ({ chat, body }) => {
    const seconds = Math.min(Math.max(Number(body.seconds) || 0, 0), 6 * 3600);
    const scroll = Math.min(Math.max(Math.round(Number(body.scroll) || 0), 0), 100);
    await pageLeft(chat, cleanString(body.url, 1000), seconds, scroll);
    return { ok: true };
  },
  { max: 120, windowMs: 60 * 60_000 },
);

export const OPTIONS = preflight;
