import { addSiteEvent } from "@/lib/webchat/chats";
import { visitorPost } from "@/lib/webchat/handler";
import { cleanString, preflight } from "@/lib/webchat/public";
import { WEB_EVENT_KINDS, type WebSiteEvent } from "@/lib/webchat/types";

/** Sent (as a beacon) when the visitor clicks a phone, WhatsApp or email link, downloads a file or copies our details. */
export const POST = visitorPost(
  async ({ chat, body }) => {
    const kind = WEB_EVENT_KINDS.find((k) => k === body.kind);
    if (!kind) throw new Error("Bad request");
    await addSiteEvent(chat, { kind: kind as WebSiteEvent["kind"], label: cleanString(body.label, 200), url: cleanString(body.url, 1000) });
    return { ok: true };
  },
  { max: 60, windowMs: 60 * 60_000 },
);

export const OPTIONS = preflight;
